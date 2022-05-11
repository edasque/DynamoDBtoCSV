const program = require("commander");
const AWS = require("aws-sdk");
const unmarshal = require("dynamodb-marshaler").unmarshal;
const Papa = require("papaparse");
const fs = require("fs");

let headers = [];
let unMarshalledArray = [];

program
  .version("0.1.1")
  .option("-t, --table [tablename]", "Add the table you want to output to csv")
  .option("-i, --index [indexname]", "Add the index you want to output to csv")
  .option("-k, --keyExpression [keyExpression]", "The name of the partition key to filter results on")
  .option("-v, --keyExpressionValues [keyExpressionValues]", "The key value expression for keyExpression. See: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html")
  .option("-c, --count", "Only get count, requires -k flag")
  .option("-a, --stats [fieldname]", "Gets the count of all occurances by a specific field name (only string fields are supported")
  .option("-d, --describe", "Describe the table")
  .option("-S, --select [select]", "Select specific fields")
  .option("-r, --region [regionname]")
  .option(
    "-e, --endpoint [url]",
    "Endpoint URL, can be used to dump from local DynamoDB"
  )
  .option("-p, --profile [profile]", "Use profile from your credentials file")
  .option("-m, --mfa [mfacode]", "Add an MFA code to access profiles that require mfa.")
  .option("-f, --file [file]", "Name of the file to be created")
  .option(
    "-ec --envcreds",
    "Load AWS Credentials using AWS Credential Provider Chain"
  )
  .option("-s, --size [size]", "Number of lines to read before writing.", 5000)
  .parse(process.argv);

  const options = program.opts();

if (!options.table) {
  console.error("You must specify a table");
  program.outputHelp({ error: true });
  process.exit(1);
}

if (options.region && AWS.config.credentials) {
  AWS.config.update({ region: options.region });
} else {
  AWS.config.loadFromPath(__dirname + "/config.json");
}

if (options.endpoint) {
  AWS.config.update({ endpoint: options.endpoint });
}

if (options.profile) {
  let newCreds = new AWS.SharedIniFileCredentials({ profile: options.profile });
  newCreds.profile = options.profile;
  AWS.config.update({ credentials: newCreds });
}

if (options.envcreds) {
  let newCreds = AWS.config.credentials;
  newCreds.profile = options.profile;
  AWS.config.update({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_DEFAULT_REGION
  });
}

if (options.mfa && options.profile) {
  const creds = new AWS.SharedIniFileCredentials({
    tokenCodeFn: (serial, cb) => {cb(null, options.mfa)},
    profile: options.profile
  });

  // Update config to include MFA
  AWS.config.update({ credentials: creds });
} else if (options.mfa && !options.profile) {
  console.error('error: MFA requires a profile(-p [profile]) to work');
  process.exit(1);
}

const dynamoDB = new AWS.DynamoDB();

// Map attribute name selections to indexed aliases - to allow querying on fields that happen to have the same name as a reserved word.
const attributeIndexSelectionPairs = options.select?.split(',')?.map((attr, index) => [`#${index}`, attr.trim()]);
const selectionsByAttributeNames = attributeIndexSelectionPairs ? Object.fromEntries(attributeIndexSelectionPairs) : undefined;

const ProjectionExpression = selectionsByAttributeNames ? Object.keys(selectionsByAttributeNames).join(",") : undefined;
const ExpressionAttributeNames = selectionsByAttributeNames;

const query = {
  TableName: options.table,
  IndexName: options.index,
  Select: options.count ? "COUNT" : (options.select ? "SPECIFIC_ATTRIBUTES" : (options.index ? "ALL_PROJECTED_ATTRIBUTES" : "ALL_ATTRIBUTES")),
  KeyConditionExpression: options.keyExpression,
  ExpressionAttributeValues: JSON.parse(options.keyExpressionValues),
  ProjectionExpression,
  ExpressionAttributeNames,
  Limit: 1000
};

const scanQuery = {
  TableName: options.table,
  IndexName: options.index,
  ProjectionExpression,
  ExpressionAttributeNames,
  Limit: 1000
};

// if there is a target file, open a write stream
if (!options.describe && options.file) {
  var stream = fs.createWriteStream(options.file, { flags: 'a' });
}
let rowCount = 0;
let writeCount = 0;
let writeChunk = options.size;

const describeTable = () => {
  dynamoDB.describeTable(
    {
      TableName: options.table
    },
    function (err, data) {
      if (!err) {
        console.dir(data.Table);
      } else console.dir(err);
    }
  );
};

 const scanDynamoDB = (query) => {
  dynamoDB.scan(query, function (err, data) {
    if (!err) {
      unMarshalIntoArray(data.Items); // Print out the subset of results.
      if (data.LastEvaluatedKey) {
        // Result is incomplete; there is more to come.
        query.ExclusiveStartKey = data.LastEvaluatedKey;
        if (rowCount >= writeChunk) {
          // once the designated number of items has been read, write out to stream.
          unparseData(data.LastEvaluatedKey);
        }
        scanDynamoDB(query);
      } else {
        unparseData("File Written");
      }
    } else {
      console.dir(err);
    }
  });
};

const appendStats = (params, items) => {
  for (let i = 0; i < items.length; i++) {
    let item = items[i];
    let key = item[options.stats].S;
  
    if (params.stats[key]) {
      params.stats[key]++;
    } else {
      params.stats[key] = 1;
    }

    rowCount++;
  }
}

const printStats = (stats) => {
  if (stats) {
    console.error("\nSTATS\n----------");
    Object.keys(stats).forEach((key) => {
      console.error(key + " = " + stats[key]);
    });
    writeCount += rowCount;
    rowCount = 0;
  }
}

const processStats = (params, data) => {
  let query = params.query;
  appendStats(params, data.Items);
  if (data.LastEvaluatedKey) {
    // Result is incomplete; there is more to come.
    query.ExclusiveStartKey = data.LastEvaluatedKey;
    if (rowCount >= writeChunk) {
      // once the designated number of items has been read, print the final count.
      printStats(params.stats);
    }
    queryDynamoDB(params);
  } 
};

const processRows = (params, data) => {
  let query = params.query;
  unMarshalIntoArray(data.Items); // Print out the subset of results.
  if (data.LastEvaluatedKey) {
    // Result is incomplete; there is more to come.
    query.ExclusiveStartKey = data.LastEvaluatedKey;
    if (rowCount >= writeChunk) {
      // once the designated number of items has been read, write out to stream.
      unparseData(data.LastEvaluatedKey);
    }
    queryDynamoDB(params);
  } else {
    unparseData("File Written");
  }
};

const queryDynamoDB = (params) => {
  let query = params.query;
  dynamoDB.query(query, function (err, data) {
    if (!err) {
      if (options.stats) {
        processStats(params, data);
      } else {
        processRows(params, data);
      }
    } else {
      console.dir(err);
    }
  });
};

const unparseData = (lastEvaluatedKey) => {
  var endData = Papa.unparse({
    fields: [...headers],
    data: unMarshalledArray
  });
  if (writeCount > 0) {
    // remove column names after first write chunk.
    endData = endData.replace(/(.*\r\n)/, "");;
  }
  if (options.file) {
    writeData(endData);
  } else {
    console.log(endData);
  }
  // Print last evaluated key so process can be continued after stop.
  console.error("last key:");
  console.error(lastEvaluatedKey);

  // reset write array. saves memory
  unMarshalledArray = [];
  writeCount += rowCount;
  rowCount = 0;
}

const writeData = (data) => {
  stream.write(data);
};

const unMarshalIntoArray = (items) => {
  if (items.length === 0) return;

  items.forEach(function (row) {
    let newRow = {};

    // console.log( 'Row: ' + JSON.stringify( row ));
    Object.keys(row).forEach(function (key) {
      if (headers.indexOf(key.trim()) === -1) {
        // console.log( 'putting new key ' + key.trim() + ' into headers ' + headers.toString());
        headers.push(key.trim());
      }
      let newValue = unmarshal(row[key]);

      if (typeof newValue === "object") {
        newRow[key] = JSON.stringify(newValue);
      } else {
        newRow[key] = newValue;
      }
    });

    // console.log( newRow );
    unMarshalledArray.push(newRow);
    rowCount++;
  });
}

if (options.describe) describeTable(scanQuery);
if (options.keyExpression) queryDynamoDB({ "query": query, stats: {} });
else scanDynamoDB(scanQuery);


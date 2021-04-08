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

if (!program.table) {
  console.log("You must specify a table");
  program.outputHelp();
  process.exit(1);
}

if (program.region && AWS.config.credentials) {
  AWS.config.update({ region: program.region });
} else {
  AWS.config.loadFromPath(__dirname + "/config.json");
}

if (program.endpoint) {
  AWS.config.update({ endpoint: program.endpoint });
}

if (program.profile) {
  let newCreds = new AWS.SharedIniFileCredentials({ profile: program.profile });
  newCreds.profile = program.profile;
  AWS.config.update({ credentials: newCreds });
}

if (program.envcreds) {
  let newCreds = AWS.config.credentials;
  newCreds.profile = program.profile;
  AWS.config.update({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_DEFAULT_REGION
  });
}

if (program.mfa && program.profile) {
  const creds = new AWS.SharedIniFileCredentials({
    tokenCodeFn: (serial, cb) => {cb(null, program.mfa)},
    profile: program.profile
  });

  // Update config to include MFA
  AWS.config.update({ credentials: creds });
} else if (program.mfa && !program.profile) {
  console.log('error: MFA requires a profile(-p [profile]) to work');
  process.exit(1);
}

const dynamoDB = new AWS.DynamoDB();

const query = {
  TableName: program.table,
  IndexName: program.index,
  Select: program.count ? "COUNT" : (program.select ? "SPECIFIC_ATTRIBUTES" : (program.index ? "ALL_PROJECTED_ATTRIBUTES" : "ALL_ATTRIBUTES")),
  KeyConditionExpression: program.keyExpression || null,
  ExpressionAttributeValues: program.keyExpressionValues? JSON.parse(program.keyExpressionValues): null,
  ProjectionExpression: program.select,
  Limit: 1000
};

const scanQuery = {
  TableName: program.table,
  IndexName: program.index,
  Limit: 1000
};

// if there is a target file, open a write stream
if (!program.describe && program.file) {
  var stream = fs.createWriteStream(program.file, { flags: 'a' });
}
let rowCount = 0;
let writeCount = 0;
let writeChunk = program.size;

const describeTable = () => {
  dynamoDB.describeTable(
    {
      TableName: program.table
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
    let key = item[program.stats].S;
  
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
    console.log("\nSTATS\n----------");
    Object.keys(stats).forEach((key) => {
      console.log(key + " = " + stats[key]);
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
      if (program.stats) {
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
  if (program.file) {
    writeData(endData);
  } else {
    console.log(endData);
  }
  // Print last evaluated key so process can be continued after stop.
  console.log("last key:");
  console.log(lastEvaluatedKey);

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

if (program.describe) describeTable(scanQuery);
if (program.keyExpression) queryDynamoDB({ "query": query, stats: {} });
else scanDynamoDB(scanQuery);

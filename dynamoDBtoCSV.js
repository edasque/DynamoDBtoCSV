const program = require('commander');
const AWS = require('aws-sdk');
const unmarshal = require('dynamodb-marshaler').unmarshal;
const Papa = require('papaparse');
const fs = require('fs');
const headers = [];
const unMarshalledArray = [];
const util = require('util');

const fsWrite = util.promisify(fs.writeFile);

program
	.version('0.0.1')
	.option('-t, --table [tablename]', 'Add the table you want to output to csv')
	.option("-d, --describe")
	.option("-r, --region [regionname]")
	.option("-e, --endpoint [url]", 'Endpoint URL, can be used to dump from local DynamoDB')
	.option("-p, --profile [profile]", 'Use profile from your credentials file')
	.option("-f, --file [file]", "Name of the file to be created")
	.parse(process.argv);

if (!program.table)
{
	console.error("You must specify a table");
	program.outputHelp();
	process.exit(1);
}

if (program.region && AWS.config.credentials)
{
	AWS.config.update({region: program.region});
} else
{
	AWS.config.loadFromPath(__dirname + '/config.json');
}

if (program.endpoint)
{
	AWS.config.update({endpoint: program.endpoint})
}

if (program.profile)
{
	const newCreds = AWS.config.credentials;
	newCreds.profile = program.profile;
	AWS.config.update({credentials: newCreds});
}

const dynamoDB = new AWS.DynamoDB();

const query = {
	"TableName": program.table,
	"FilterExpression": "attribute_exists(acertou)",
	"Limit": 500
};

const describeTable = async function()
{
	try
	{
		let data = await dynamoDB.describeTable({
			"TableName": program.table
		}).promise();
		console.dir(data.Table);
	} catch (err)
	{
		console.dir(err);
	}
}

const scanDynamoDB = async function(query)
{
	try
	{
		let data = await dynamoDB.scan(query).promise();
		unMarshalIntoArray(data.Items); // Print out the subset of results.
		if (data.LastEvaluatedKey)
		{ // Result is incomplete; there is more to come.
			console.warn('Buscando mais dados')
			console.warn(data.LastEvaluatedKey)
			query.ExclusiveStartKey = data.LastEvaluatedKey;
			setTimeout( () => scanDynamoDB(query), 2000);
			return;
		}
		let endData = Papa.unparse({fields: [...headers], data: unMarshalledArray});
		if (program.file)
		{
			await writeData(endData)
			return;
		}
		console.log(endData);
	} catch (err)
	{
		console.dir(err);
	}
};

const writeData = async function(data)
{
	try
	{
		await fsWrite(program.file, data);
		console.log('File Saved');
	} catch (err)
	{
		console.error(err);
	}
}

const unMarshalIntoArray = function(items)
{
	if (items.length === 0)
		return;

	items.forEach(row =>
	{
		let newRow = {};
		// console.log( 'Row: ' + JSON.stringify( row ));
		Object.keys(row).forEach(function(key)
		{
			if (!headers.includes(key.trim()))
			{
				// console.log( 'putting new key ' + key.trim() + ' into headers ' + headers.toString());
				headers.push(key.trim());
			}
			let newValue = unmarshal(row[key]);

			if (typeof newValue === 'object')
			{
				newRow[key] = JSON.stringify(newValue);
			}
			else
			{
				newRow[key] = newValue;
			}
		});
		// console.log( newRow );
		unMarshalledArray.push(newRow);
	});
}

if (program.describe) describeTable();
else scanDynamoDB(query);
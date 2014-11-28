var program = require('commander');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
var dynamoDB = new AWS.DynamoDB();

var iKnowTheHeaders = false;

program.version('0.0.1').option('-t, --table [tablename]', 'Add the table you want to output to csv').option("-d, --describe").parse(process.argv);

if(!program.table) {
	console.log("You must specify a table");
	program.outputHelp();
	process.exit(1);
}

var query = {
	"TableName": program.table,
	"Limit": 1000,
};


var describeTable = function(query) {

    dynamoDB.describeTable({"TableName": program.table}, function(err, data) {

			if(!err) {

				console.dir(data.Table);

			} else console.dir(err);
		});
	}


var scanDynamoDB = function(query) {

		dynamoDB.scan(query, function(err, data) {

			if(!err) {

				printout(data.Items) // Print out the subset of results.
				if(data.LastEvaluatedKey) { // Result is incomplete; there is more to come.
					query.ExclusiveStartKey = data.LastEvaluatedKey;
					scanDynamoDB(query);
				};
			} else console.dir(err);

		});
	};

function arrayToCSV(array_input) {
	var string_output = "";
	for(var i = 0; i < array_input.length; i++) {
		string_output += ('"' + array_input[i].replace('"', '\"') + '"')
		if(i != array_input.length - 1) string_output += ","
	};
	return string_output;
}

function printout(items) {

	if(!iKnowTheHeaders) {
		var headers = [];
		if(items.length > 0) {
			for(var propertyName in items[0]) headers.push(propertyName)
			console.log(arrayToCSV(headers))
			iKnowTheHeaders = true;
		}
	}

	for(index in items)

	{

		var values = []
		for(var propertyName in items[index])

		{
            if (items[index][propertyName].N) {
                var value = items[index][propertyName].N;
            }
            else if (items[index][propertyName].S) {
                var value = items[index][propertyName].S;
            }
            else if (items[index][propertyName].SS) {
                var value = items[index][propertyName].SS.toString();
            }
            else {
                var value = "";
            }

			values.push(value)
		}
		console.log(arrayToCSV(values))



	}

}
if(program.describe) describeTable(query);
else scanDynamoDB(query);

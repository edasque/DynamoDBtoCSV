var program = require('commander');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');
var dynamoDB = new AWS.DynamoDB();
var headers = [];

program.version('0.0.1').option('-t, --table [tablename]', 'Add the table you want to output to csv').option("-d, --describe").parse(process.argv);

if (!program.table) {
    console.log("You must specify a table");
    program.outputHelp();
    process.exit(1);
}

var query = {
    "TableName": program.table,
    "Limit": 1000,
};


var describeTable = function(query) {

    dynamoDB.describeTable({
        "TableName": program.table
    }, function(err, data) {

        if (!err) {

            console.dir(data.Table);

        } else console.dir(err);
    });
}


var scanDynamoDB = function(query) {

    dynamoDB.scan(query, function(err, data) {

        if (!err) {

            printout(data.Items) // Print out the subset of results.
            if (data.LastEvaluatedKey) { // Result is incomplete; there is more to come.
                query.ExclusiveStartKey = data.LastEvaluatedKey;
                scanDynamoDB(query);
            };
        } else console.dir(err);

    });
};

function arrayToCSV(array_input) {
    var string_output = "";
    for (var i = 0; i < array_input.length; i++) {
        array_input[i] = array_input[i].replace(/\r?\n/g, "");
        string_output += ('"' + array_input[i].replace(/\"/g, '\\"') + '"')
        if (i != array_input.length - 1) string_output += ","
    };
    return string_output;
}

function printout(items) {
    var headersMap = {};
    var values;
    var header;
    var value;

    if (headers.length == 0) {
        if (items.length > 0) {
            for (var i = 0; i < items.length; i++) {
                for (var key in items[i]) {
                    headersMap[key] = true;
                }
            }
        }
        for (var key in headersMap) {
            headers.push(key);
        }
        console.log(arrayToCSV(headers))
    }

    for (index in items) {
        values = [];
        for (i = 0; i < headers.length; i++) {
            value = "";
            header = headers[i];
            // Loop through the header rows, adding values if they exist
            if (items[index].hasOwnProperty(header)) {
                if (items[index][header].N) {
                    value = items[index][header].N;
                } else if (items[index][header].S) {
                    value = items[index][header].S;
                } else if (items[index][header].SS) {
                    value = items[index][header].SS.toString();
                } else if (items[index][header].NS) {
                    value = items[index][header].NS.toString();
                } else if (items[index][header].B) {
                    value = items[index][header].B.toString('base64');
                } else if (items[index][header].M) {
                    value = JSON.stringify(items[index][header].M);
                } else if (items[index][header].L) {
                    value = JSON.stringify(items[index][header].L);
                } else if (items[index][header].BOOL !== undefined) {
                    value = items[index][header].BOOL.toString();
                }
            }
            values.push(value)
        }
        console.log(arrayToCSV(values))
    }
}

if (program.describe) describeTable(query);
else scanDynamoDB(query);

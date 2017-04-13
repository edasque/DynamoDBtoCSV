var program = require('commander');
var AWS = require('aws-sdk');
var unmarshalItem = require('dynamodb-marshaler').unmarshalItem;
var unmarshal = require('dynamodb-marshaler').unmarshal;
var Papa = require('papaparse');
var headers = [];
var unMarshalledArray = [];

program.version('0.0.1').option('-t, --table [tablename]', 'Add the table you want to output to csv').option("-d, --describe").option("-r, --region [regionname]").parse(process.argv);

if (!program.table) {
  console.log("You must specify a table");
  program.outputHelp();
  process.exit(1);
}

if (program.region && AWS.config.credentials) {
  AWS.config.update({region: program.region});
} else {
  AWS.config.loadFromPath('./config.json');
}
var dynamoDB = new AWS.DynamoDB();

var query = {
  "TableName": program.table,
  "Limit": 1000
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


var scanDynamoDB = function ( query ) {

  dynamoDB.scan( query, function ( err, data ) {

    if ( !err ) {
      unMarshalIntoArray( data.Items ); // Print out the subset of results.
      if ( data.LastEvaluatedKey ) { // Result is incomplete; there is more to come.
        query.ExclusiveStartKey = data.LastEvaluatedKey;
        scanDynamoDB(query);
      }
      else {
        let dummyRow = {};
        headers.forEach( function ( key ) {
          dummyRow[key] = 'dummy';
        });

        // console.log( JSON.stringify( dummyRow ) );
        unMarshalledArray.unshift( dummyRow );
        console.log(Papa.unparse( unMarshalledArray ));
      }
    } 
    else 
      console.dir(err);

  });
};

function unMarshalIntoArray( items ) {
  if ( items.length === 0 )
    return;

  items.forEach( function ( row ) {
    let newRow = {};

    // console.log( 'Row: ' + JSON.stringify( row ));
    Object.keys( row ).forEach( function ( key ) {
      if ( headers.indexOf( key.trim() ) === -1 ) {
        // console.log( 'putting new key ' + key.trim() + ' into headers ' + headers.toString());
        headers.push( key.trim() );
      }
      let newValue = unmarshal( row[key] );

      if ( typeof newValue === 'object' ) {
        newRow[key] = JSON.stringify( newValue );
      }
      else {
        newRow[key] = newValue;
      }
    });

    // console.log( newRow );
    unMarshalledArray.push( newRow );

  });

}

if ( program.describe ) describeTable( query );
else scanDynamoDB( query );


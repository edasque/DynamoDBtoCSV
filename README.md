AWS DynamoDBtoCSV
==================

This application will export the content of a DynamoDB table into a CSV (Comma delimited value) output. All you need to do is create a *config.json* file in that same directory where you configure your *accessKeyId*, *secretAccessKey* and *region* as such:

	{
	    "accessKeyId": "REPLACE",
	    "secretAccessKey": "REPLACE",
	    "region": "REPLACE"
	}

The output is comma separated and each field is enclosed by double quotes ("). Double quotes in the data as escaped as \"

Usage
-------------------

typically, to use you'd run:

	node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP > output.csv

to export to CSV

Use *-d* to describe the table prior so you can have an idea of the number of rows you are going to export

	node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -d

to get some information about the table.

Full syntax is:

	node dynamoDBtoCSV.js --help
		Usage: dynamoDBtoCSV.js [options]

	Options:

    	-h, --help               output usage information
    	-V, --version            output the version number
    	-t, --table [tablename]  Add the table you want to output to csv
    	-d, --describe           


Pre-requisites
--------------
You'll need to install a few modules, including:
* aws-sdk
* commander
	
	npm install aws-sdk commander

should do it. 

Example output
--------------

	"HashOf10","DateIPAdID","adcount"
	"37693cfc748049e45d87b8c7d8b9aacd","2013011720024058205168000000010002","1"
	"37693cfc748049e45d87b8c7d8b9aacd","2013011720050084232194000000010002","1"

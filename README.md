# AWS DynamoDBtoCSV

[![Join the chat at https://gitter.im/edasque/DynamoDBtoCSV](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/edasque/DynamoDBtoCSV?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

This application will export the content of a DynamoDB table into CSV (comma-separated values) output. All you need to do is update `config.json` with your AWS credentials and region.

The output is comma-separated and each field is enclosed by double quotes ("). Double quotes in the data as escaped as \"

This software is governed by the Apache 2.0 license.

## Usage

typically, to use you'd run:

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP > output.csv

or even:

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -f output.csv

to export to CSV

Use _-d_ to describe the table prior so you can have an idea of the number of rows you are going to export

    node dynamoDBtoCSV.js -t Hourly_ZEDO_Impressions_by_IP -d

to get some information about the table.

Full syntax is:

    node dynamoDBtoCSV.js --help
    	Usage: dynamoDBtoCSV.js [options]

    Options:

      -h, --help                            output usage information
      -V, --version                         output the version number
      -t, --table [tablename]               Add the table you want to output to csv
      -i, --index [indexname]               Add the index you want to output to csv
      -k, --keyExpression [keyExpression]   The name of the partition key to filter results on
      -v, --KeyExpressionValues [value]     The expression for filtering on the primary key
      -S, --select [list of fields]         The list of fields to select on
      -c, --count                           Only get count, requires -pk flag
      -a, --stats [fieldname]               Gets the count of all occurances by a specific field name 
                                            (only string fields are supported presently)
      -e, --endpoint [url]                  Endpoint URL, can be used to dump from local DynamoDB
      -f, --file [file]                     Name of the file to be created
      -d, --describe                        Describe the table
      -p, --profile [profile]               Use profile from your credentials file
      -ec --envcreds                        Load AWS Credentials using AWS Credential Provider Chain

## Pre-requisites

You'll need to install a few modules, including:

- aws-sdk
- commander
- dynamodb-marshaler
- papaparse

npm install

should do it.

## Example output

    "HashOf10","DateIPAdID","adcount"
    "37693cfc748049e45d87b8c7d8b9aacd","2013011720024058205168000000010002","1"
    "37693cfc748049e45d87b8c7d8b9aacd","2013011720050084232194000000010002","1"

## Advanced queries

Output a selection of columns
```
node dynamoDBtoCSV.js -t my-table -i rule_type_id_index -k "rule_type_id = :v1" -v "{\":v1\": {\"S\": \"my_primary_key_valye\"}}" -s "rule_type_id, created_by" -r us-west-2
```

Output stats
```
node dynamoDBtoCSV.js -t my-table -i rule_type_id_index -k "rule_type_id = :v1" -v "{\":v1\": {\"S\": \"my_primary_key_valye\"}}" -s "rule_type_id, created_by" -r us-west-2 -a created_by
```

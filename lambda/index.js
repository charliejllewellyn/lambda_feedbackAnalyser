exports.handler = (event, context, callback) => {

    if (event.queryStringParameters === null || event.queryStringParameters === undefined) {
    
        buildFailResponse(callback, "missing parameters");
        return;
    }
    
    console.log(event.queryStringParameters);

    
    var statusObj = {};
    statusObj.sentimentDetected = false;
    statusObj.entitiesDetected = false;
    statusObj.keyPhrasesDetected = false;
    statusObj.syntaxDetected = true; //JS sdk doesn't support yet
    
    
    var responseObj = {
            "@timestamp" : new Date(new Date().toUTCString()), //looks weird, works well with ElasticSearch
            "feedback" : event.queryStringParameters,
            "_status" : statusObj
        };
    
    analyseFeedback(callback,responseObj);

};

var awsRegion = 'eu-west-1';
var AWS = require('aws-sdk');
var isDebug = false;
var allowESPost = true;
const WAIT_TIME = 100;

var es_endpoint = '<your_es_endpoint>.amazonaws.com';
var aws_creds = new AWS.EnvironmentCredentials('AWS');
var comprehend = new AWS.Comprehend();






function checkForResults(callback, responseObj){
    if (isDebug){console.log('=== Checking for Results ===')};
    if (responseObj._status.sentimentDetected && responseObj._status.entitiesDetected && 
        responseObj._status.syntaxDetected && responseObj._status.keyPhrasesDetected)
    {
        delete responseObj._status;
        postDataToES(responseObj);
        buildSuccessResponse(callback, { result: true, reason: "done" });
    } else {
        if (isDebug){console.log('Results not ready, waiting')};
        setTimeout(function(){
          checkForResults(callback,responseObj);
        },WAIT_TIME);           
    }  
}



// Comprehend

function analyseFeedback(callback, responseObj){
    
      if (isDebug){console.log('=== Analyse English Text ===')};
      
      if ((responseObj.feedback.comments === undefined) || (responseObj.feedback.comments.length === 0)){
            responseObj._status.sentimentDetected = true;
            responseObj._status.sentimentDetected = true;
            responseObj._status.entitiesDetected = true;
            responseObj._status.keyPhrasesDetected = true;
            responseObj._status.syntaxDetected = true; //JS sdk doesn't support yet
      } else {
    
    
            //async kick analysis tasks others
            setTimeout(function(){
                detectSentiment(callback, responseObj),1});
                
            setTimeout(function(){
                detectEntities(callback, responseObj),1});
                
                
            setTimeout(function(){
                detectKeyPhrases(callback, responseObj),1});            
                
            // setTimeout(function(){
            //     detectSyntax(callback, responseObj),1});
            
      }
        //wait for results
        setTimeout(function(){
          checkForResults(callback,responseObj);
        },WAIT_TIME);          
}

function detectSentiment(callback, responseObj) {

    if (isDebug){console.log('=== detectSentiment ===')};
    
    var params = {
        LanguageCode: 'en',
        Text: responseObj.feedback.comments
    };
    

    comprehend.detectSentiment(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);
        }
        else {
            responseObj._status.sentimentDetected = true;
            responseObj.Sentiment = data;
        }
    });

}

function detectEntities(callback, responseObj) {

    if (isDebug){console.log('=== detectEntities ===')};
    var params = {
        LanguageCode: 'en',
        Text: responseObj.feedback.comments
    };

    comprehend.detectEntities(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);
        }
        else {
            responseObj._status.entitiesDetected = true;
            responseObj.Entities = data;
        }
    });

}



function detectKeyPhrases(callback, responseObj) {

    if (isDebug){console.log('=== detectKeyPhrases ===')};
    var params = {
        LanguageCode: 'en',
        Text: responseObj.feedback.comments
    };

    comprehend.detectKeyPhrases(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);

        }
        else {
            responseObj._status.keyPhrasesDetected = true;
            responseObj.KeyPhrases = data;
            
            //lowercase this stuff for better tag clouds
            for (var i=0; i<responseObj.KeyPhrases.KeyPhrases.length; i++){
                var firstChar = responseObj.KeyPhrases.KeyPhrases[i].Text.charAt(0);
                if ((firstChar != "@") &&  (firstChar != "#")){
                    responseObj.KeyPhrases.KeyPhrases[i].Text = responseObj.KeyPhrases.KeyPhrases[i].Text.toLowerCase();
                }
            }
        }
    });

}




// Elastic 


function postDataToES(inputData) {
    
    if (!allowESPost){
        console.log('======= SKIPPING ES POST =======');
        return;
    }

    //Create a signed request
    var endpoint = new AWS.Endpoint(es_endpoint);
    var req = new AWS.HttpRequest(endpoint);

    req.method = 'POST';
    req.path = '/event/responses';
    if (isDebug){console.log("Start: Send data sent to Elastic Search")};
    
    req.region = awsRegion;
    req.headers['presigned-expires'] = false; 
    req.headers['Host'] = endpoint.host; 
    req.headers['content-type'] = 'application/json';
    req.body = JSON.stringify(inputData);

    // Sign the request (Sigv4)
    var signer = new AWS.Signers.V4(req, 'es');
    signer.addAuthorization(aws_creds, new Date());

    // Post document to ES
    var send = new AWS.NodeHttpClient();
    send.handleRequest(req, null, function(httpResp) {
        var responseBody = '';
        httpResp.on('data', function (chunk) {
            responseBody += chunk;
        });
        httpResp.on('end', function (chunk) {
            if (isDebug){console.log('Sending:' + JSON.stringify(inputData))};
            if (isDebug){console.log("End: Data sent to Elastic Search")};
        });
    }, function(err) {
        console.log('Send to ES Error: ' + err);
    });
}


// Lambda helpers

function buildSuccessResponse(callback, reason){
    const response = {
            statusCode: 200,
                "headers": {
                    "access-control-allow-origin": "https://mydomain.net
                },
            body: JSON.stringify(reason),
            "isBase64Encoded": false
        };   
        
    callback(null, response);
}

function buildFailResponse(callback, err){
    const response = {
            statusCode: 200,
                "headers": {
                    "access-control-allow-origin": "https://mydomain.net
                },
            body: JSON.stringify(err),
            "isBase64Encoded": false
        };
    callback(null, response);
}

const PublishResults = require("./publishResults.js");

let publish = new PublishResults()

let start = Date.now()
publish.processResultsPlaywright()
console.log(`Elapsed time: ${(Date.now()-start)/1000}`)

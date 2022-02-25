/* Requirements */

const http = require( "http" )
const https = require( "https" )

const fs = require( "fs" ).promises
const { createReadStream } = require( "fs" )

const { Buffer } = require( "buffer" )

const config = require( "config" )


/* Initialization */

const defaultHost = "localhost"
const defaultPort = 8000

/*
  You will require a config file (default path: ./config/default.json):
  {
    "devweb": {
      "localwebroot": "C:/Users/Bueno/Documents/GitHub/arit-calendar/out",
      "proxyhost": "www.aroomintown.com",
      "accesstoken": "b225dfc4466f7cad0c519d6082703b1943b335fa",
      "addressredirects" : {
        "/a/": "/calendar/"
      },
      "mimemap": {
        ".js": "application/javascript",
        ".html": "text/html",
        ".css": "text/css"
      },
      "servicefilepath": "./services.js"
    }
  }
*/

/* get devweb settings, assign servicefilepath and declare remaining */

const c = { ...config.devweb }

let { servicefilepath } = c
let host, port, localwebroot, proxyhost, accesstoken, addressredirects, mimemap


/* Customization */

/*
  Services can be made available from the service file path in config:
  module.exports.available = {
    service1Name: async function( config, parts, data ) {
      // return result
    }
  };
*/

let services = { available: {} };

/*
  Arguments to the server can be passed after the filename at startup:

  > node index.js --flag /service?key=value

  Each option is defined in an object included in the options array,
  w/ an action, one or both of a long and short form, any params and
  an optional summary:

  const options = [
    {
      long:   "flag",
      short:  "f",
      intent: "triggers an action",
      params: 1, // default 0
      action: function( param ) {
        // do something
      }
    }
  ]
*/

const options = [
  {
    long:   "config",
    short:  "c",
    intent: "show devweb config object and exit",
    action: showConfigObj
  },
  {
    long:   "help",
    short:  "h",
    intent: "show help text and exit",
    action: showHelpText
  },
  {
    long:   "set",
    short:  "s",
    intent: "set a config item, arrays comma-separated (e.g. -s arr \"1,2\") & nested key-value pairs colon-separated (e.g. -s obj \"k:v\")",
    params: 2,
    action: setConfigItem
  }
]

/* Option actions */

function showConfigObj() {
  console.log( "Devweb config object:" );
  console.log( c );
  process.exit();
}

function showHelpText() {
  const getLongest = key => Math.max( ...options.map( f => f[ key ].length ) )
  const longestShort = getLongest( "short" )
  const longestLong = getLongest( "long" )
  /*
     generate and log a string with one line per option, in columns
     each of a width based on the longest item listed, plus padding
  */
  const optionsStr = options.map( f => [
    " " +
    ( f.short  &&  "-" + f.short.padEnd( longestShort + 2 ) ),
    ( f.long   && "--" + f.long.padEnd(  longestLong  + 3 ) ),
    ( f.intent && f.intent )
  ].join( "" ) ).join( "\n" )
  console.log( "Options:\n" + optionsStr )
  process.exit()
}

function setConfigItem( [ key, value ] ) {
  /* handle config item of primitive type */
  if( "string" === typeof c[ key ] ) {
    console.log( `Setting ${ key } to '${ value }'` )
    c[ key ] = value
  }
  if( [ "number", "boolean" ].includes( typeof c[ key ] ) ) {
    console.log( `Setting ${ key } to ${ value }` )
    if( "number" === typeof c[ key ] ) value = parseInt( value )
    if( "boolean" === typeof c[ key ] ) value = value.toLowerCase() === "true" ? true : false
    c[ key ] = value
  }
  /* handle config item where array */
  else if( Array.isArray( c[ key ] ) ) {
    const valueArr = value ? value.split( "," ) : []
    console.log( `Setting ${ key } to`, valueArr )
    c[ key ] = valueArr
  }
  /* handle config item of type object */
  else if( "object" === typeof c[ key ] ) {
    const valuePair = value ? value.split( ":" ) : []
    if( 2 !== valuePair.length ) return console.log( "Command-line argument to set ${ key } unclear - not set" )
    console.log( `Setting ${ key } to hold key '${ valuePair[ 0 ] }' with value '${ valuePair[ 1 ] }'` )
    c[ key ] = { ...c[ key ], ...Object.fromEntries( [ valuePair ] ) }
  }
  /* handle non-config item */
  if( !Object.keys( c ).includes( key ) ) {
    console.log( `Setting ${ key } to '${ value }'` )
    c[ key ] = value
  }
}

/* Lifecycle hooks */

const lifecycleHooks = {
  onRequestReceive: {},
  onResponseSend: {}
}

/* Startup process */

/*
   get CLI args,
   parse for and apply any flags and assign core devweb config items,
   check for and require any service file and parse for and call any services and
   start server
*/

const args = process.argv.slice( process.argv.indexOf( __filename ) + 1 )

handleArgsFlags()
pullConfig()

fs.access( servicefilepath )
  .then( () => {
    console.log( `Including services in file ${ servicefilepath }` )
    services = { available: { ...services.available, ...require( servicefilepath ).available } }
    const availableStr = Object.keys( services.available ).map( key => " /" + key ).join( "\n" )
    console.log( availableStr ? "Available:\n" + availableStr : "No services made available" )
  } )
  .catch( err => {
    console.log( `Unable to use services file - ${ err }` )
  } )
  .then( () => {
    handleArgsServices()
    initServer()
  } )

/* Startup functions */

function handleArgsFlags() {

  args.forEach( async ( arg, argInd, argArr ) => {

    /* return if arg neither recognized format nor available option, else apply */

    if( ![ "-", "--" ].includes( arg[ 0 ] ) ) return

    let usedArg = false

    options.forEach( option => {
      if( arg !== "-" + option.short && arg !== "--" + option.long ) return
      usedArg = true
      console.log( "Applying option for flag", arg )
      const nextInd = argInd + 1
      const optPars = option.params || 0
      const allPars = optPars && args.slice( nextInd, nextInd + optPars )
      if( allPars.length < optPars ) return console.log( "Insufficient arguments to option", arg )
      allPars
        ? option.action( allPars.length === 1 ? allPars[ 0 ] : allPars )
        : option.action()
    } )

    if( !usedArg ) console.log( "No option found for argument", arg )
  } )
}

function handleArgsServices() {

  args.forEach( async ( arg, argInd, argArr ) => {

    /* return if arg neither recognized format nor available service, else call */

    if( ![ "/" ].includes( arg[ 0 ] ) ) return

    const parts = getURLParts( arg )
    const serviceName = parts.route.slice( 1 )

    if( !( serviceName in services.available ) ) return console.log( "No service found for argument", arg )

    await handleServiceCall( serviceName, parts )
  } )
}

function pullConfig() {
  ( {
      host = defaultHost,
      port = defaultPort,
      localwebroot,
      proxyhost: weblocation,
      accesstoken,
      addressredirects,
      extractioncriteria = [ "method" ],
      mimemap,
      servicefilepath
    } = c )
}

function initServer() {

  async function handleRequest( req, res ) {

    console.log( "Received request:", req.method, req.url )

    runLifecycleHooks( "onRequestReceive", req, res )

    /* handle any path part replacement */

    const url = redirectaddress( req.url )
    req.url = url;

    /* get relevant values from URL then call service, serve file or make proxy request */

    const parts = getURLParts( url )
    const route = parts.route

    const serviceName = route.slice( 1 )

    /* check whether service and if so call */
    if( serviceName in services.available ) {
      await handleServiceCall( serviceName, parts, req, res )
    }
    /* serve file or manage proxy request */
    else {
      await handleFileOrProxyRequest( req, res, route )
    }
  }

  const server = http.createServer( handleRequest )

  server.listen( port, host, () => {
    console.log( `Serving from directory ${ localwebroot } at http://${ host }:${ port }` )
  } )
}


/* Utility functions */

/* return object containing URL parts */
function getURLParts( url ) {

  const hasQueryStr = url.includes( "?" )

  const parts = {
    route: hasQueryStr ? url.slice( 0, url.indexOf( "?" ) ) : url,
    query: hasQueryStr ? url.slice( url.indexOf( "?" ) ) : "",
    pairs: {}
  }

  if( hasQueryStr ) {
    const keyValPairs = parts.query.slice( 1 ).split( "&" )
    keyValPairs.forEach( pair => {
      const keyOrVal = pair.split( "=" )
      parts.pairs[ keyOrVal[ 0 ] ] = keyOrVal[ 1 ]
    } )
  }
  return parts
}

/* return URL with path part(s) replaced or not per addressredirects setting */
function redirectaddress( addr ) {
  for ( key in addressredirects ) {
    if( 0 == addr.indexOf( key ) ) {
      addr = addr.replace( key, addressredirects[ key ] )
      console.log( `Redirecting to ${ addr }` )
    }
  }
  return addr
}

/* call each hook for a given lifecycle stage */
const runLifecycleHooks = function( stage, req, res ) {
  Object.values( lifecycleHooks[ stage ] )
    .forEach( value => {
      value( req, res )
    } )
}


/* Request handling */

/* return true if data extraction criteria met */
function shouldExtract( req ) {
  const headers = Object.keys( req.headers ).map( key => key.toLowerCase() )
  const results = extractioncriteria.map( extractioncriterion =>
    ( "method" === extractioncriterion && "GET" !== req.method ) ||
    ( "header" === extractioncriterion && ( headers.includes( "content-length" ) || headers.includes( "transfer-encoding" ) ) )
      ? true
      : false
  )
  const failures = results.filter( result => true !== result )
  return failures.length === 0
}

/* return data extracted from request */
async function extractData( req ) {
  const chunks = [];
  for await ( chunk of req ) {
    chunks.push( chunk );
  }
  const data = Buffer.concat( chunks ).toString()
  return data
}

/* make service call and respond with result or log if any */
async function handleServiceCall( service, parts, req, res ) {

  console.log( `Calling service ${ service }` )

  let result
  /* handle service call via CLI */
  if( "undefined" === typeof req ) {
    result = await services.available[ service ]( config, parts, undefined, lifecycleHooks )
    return result ? console.log( result ) : false
  }
  /* handle service call via URL */
  else if( !shouldExtract( req ) ) {
    result = await services.available[ service ]( config, parts, undefined, lifecycleHooks )
  }
  else {
    const data = await extractData( req )
    result = await services.available[ service ]( config, parts, data, lifecycleHooks )
  }
  sendResponse( req, res, result )
}

/* respond with file */
function serveFile( req, res, filename ) {

  console.log( `Serving local copy of ${ filename.slice( 1 ) }` )

  const filext = /(?:\.([^.]+))?$/.exec( req.url )
  const mimetype = mimemap[ filext[ 0 ] ] || "text/html"

  res.setHeader( "Content-Type", mimetype )
  res.setHeader( "Cache-Control", "public, max-age=0" );
  res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

  const stream = createReadStream( localwebroot + filename )
  stream.on( "error", err => {
    console.log( `Unable to serve file ${ filename } - ${ err }` )
    sendResponse( req, res, "Server error - sorry", 500 )
  } )

  sendResponse( req, res, stream )
}

/* respond with proxy response */
function manageProxyRequest( req, res, data ) {

  console.log( `Passing request to server` )

  /* default options object for GET method */
  const options = {
    host: weblocation,
    path: req.url,
    method: req.method,
    headers: {
      'Authorization': `Bearer ${ accesstoken }`,
    }
  }

  /* add headers for POST, PUT and DELETE */
  if( "GET" != req.method ) {
    options.headers[ "Content-Type" ] = req.headers[ "content-type" ]
    options.headers[ "Content-Length" ] = req.headers[ "content-length" ]
  }

  const httpsreq = https.request( options, resp => {

    console.log( "Received response for request", req.method, req.url )
    console.log( "- statusCode:", resp.statusCode)
    console.log( "- headers:", resp.headers)

    if( 404 === resp.statusCode ) {
      return sendResponse( req, res, "Not found on remote", 404 )
    }

    res.setHeader( "Content-Type", resp.headers[ "content-type" ] )
    res.setHeader( "Cache-Control", "public, max-age=0" );
    res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

    sendResponse( req, res, resp )
  } )

  httpsreq.on( "error", err => {
    console.log( `Unable to complete proxy request for ${ req.method } ${ req.url } - ${ err }` )
    sendResponse( req, res, "Server error - sorry", 500 )
  } )

  if( "GET" != req.method ) httpsreq.write( data )
  httpsreq.end()
}

const handleFileOrProxyRequest = async function( req, res, name ) {

  /* check whether file and if not assume URL and make request */
  try {

    if( "/" === name.slice( -1 ) ) name += "index.html"
    await fs.access( localwebroot + name )
    serveFile( req, res, name )

  } catch {

    if( !shouldExtract( req ) ) {
      manageProxyRequest( req, res )
    }
    else {
      const data = await extractData( req )
      manageProxyRequest( req, res, data )
    }
  }
}

const sendResponse = function( req, res, data, status = 200 ) {

  runLifecycleHooks( "onResponseSend", req, res )

  /* pipe data if stream */
  if( data && data?._readableState ) return data.pipe( res )

  res.writeHead( status )
  res.end( data )
}

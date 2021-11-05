/* Requirements */

const http = require( "http" )
const https = require( "https" )
const path = require( "path" )
const fs = require( "fs" ).promises

const config = require( "config" )

/* Initialization */

const host = "localhost"
const port = 8000

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

/* assign settings from config file */
const localwebroot = config.get( "devweb.localwebroot" )
const weblocation = config.get( "devweb.proxyhost" )
const accesstoken = config.get( "devweb.accesstoken" )
const addressredirects = config.get( "devweb.addressredirects" )
const mimemap = config.get( "devweb.mimemap" )
const servicefilepath = config.get ( "devweb.servicefilepath" )

/* Modification */

/*
  Services can be made available from the service file path in config:
  module.exports.available = {
    service1Name: async function() {
      // return data
    }
  };
*/

let services = { available: {} };

/* check for services, require if present and parse any command-line arguments */
fs.access( servicefilepath )
  .then( res => {
    console.log( `Including services in file ${servicefilepath}` )
  } )
  .catch( err => {
    console.log( "No services file found" )
  } )
  .then( () => {
    services = { available: { ...services.available, ...require( servicefilepath ).available } }
    const availableStr = Object.keys( services.available ).map( key => " /" + key ).join( "\n" )
    console.log( availableStr ? "Available:\n" + availableStr : "No services made available" )
  } )
  .catch( err => {
    console.log( `Services file unsuitable - ${err}` )
  } )
  .then( () => {
    handleArgs()
  } )

/*
  Arguments to the server can be passed after the filename at startup:
  > node index.js --flag /service?key=value

  Each option is defined in an object included in the flags array:
  const flags = [
    {
      long: "flag",
      short: "f",
      intent: "triggers an action",
      action: function() {
        // do something
      }
    }
  ]
*/

function handleArgs() {

  const args = process.argv.slice( process.argv.indexOf( __filename ) + 1 )

  /* list available flags, each w/ action, one or both of long and short form and optional summary */
  const flags = [
    {
      long: "help",
      short: "h",
      intent: "show help text and exit",
      action: () => {
        const optionsStr = flags.map( f => [ f.long && " --" + f.long, f.short && " -" + f.short, f.intent && f.intent ].join( "\t" ) ).join( "\n" )
        console.log( "Options:\n" + optionsStr )
        process.exit()
      }
    }
  ]

  args.forEach( async arg => {

    let usedArg = false

    /* check whether flag and if so apply */
    flags.forEach( flag => {
      if( arg === "-" + flag.short || arg === "--" + flag.long ) {
        usedArg = true
        console.log( "Applying option for flag", arg )
        flag.action()
      }
    } )
    /* check whether service and if so call */
    const parts = getURLParts( arg )
    if( parts.route[ 0 ] === "/" && parts.route.slice( 1 ) in services.available ) {
      usedArg = true
      await invokeService( parts.route.slice( 1 ), parts )
    }

    if( !usedArg ) console.log( "No option or service found for argument", arg )
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
  for (key in addressredirects) {
    if( 0 == addr.indexOf( key ) ) {
      addr = addr.replace( key, addressredirects[ key ] );
      console.log( `Redirecting to ${ addr }` )
    }
  }
  return addr
}

/* Service handling */

/* return result from service call */
async function invokeService( service, parts, req = {}, res = {} ) {
  console.log( `Calling service ${ service }` )
  return await services.available[ service ]( config, parts, req.body )
}

/* Request handling */

function proxrequest( req, res, data ) {

  /* default options object for GET method */
  const options = {
    host: weblocation,
    path: req.url,
    method: req.method,
    headers: {
      'Authorization': `Bearer ${accesstoken}`,
    }
  }

  /* add headers for POST, PUT and DELETE */
  if( "GET" != req.method ) {
    options.headers[ "Content-Type" ] = req.headers[ "content-type" ]
    options.headers[ "Content-Length" ] = req.headers[ "content-length" ]
  }

  const httpsreq = https.request( options, (resp) => {

    console.log( "Received response for request", req.method, req.url )
    console.log( "- statusCode:", resp.statusCode)
    console.log( "- headers:", resp.headers)

    if( 404 === resp.statusCode ) {
      res.writeHead( 404 )
      res.end( "Not found on remote" )
      return
    }

    res.setHeader( "Content-Type", resp.headers[ "content-type" ] )
    res.setHeader( "Cache-Control", "public, max-age=0" );
    res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

    resp.on( "data", ( chunk ) => {
      res.write( chunk )
    } )
    // The whole response has been received. Print out the result.
    resp.on( "end", () => {
      res.end( () => {} )
    } )
  } )

  httpsreq.on( "error", ( err ) => {
    res.writeHead( 500 )
    res.end( "Server error - sorry" )
  } )

  if( "GET" != req.method ) httpsreq.write( data )
  httpsreq.end()
}

const handleFileOrProxy = async function( req, res, filename ) {

  let data

  /* check whether file and if not assume URL and make request */
  try {

    data = await fs.readFile( localwebroot + filename, "utf8" )
    console.log( `Serving local copy of ${ filename.slice( 1 ) }` )

  } catch {

    console.log( `Passing request to server` )

    if( "GET" == req.method ) {
      proxrequest( req, res )
    }
    else {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      } )
      req.on('end', () => {
        proxrequest( req, res, data )
      } )
    }
    return "proxied"
  }

  return data
}

/* Server setup */

const server = http.createServer( async function ( req, res ) {

  console.log( "Received request:", req.method, req.url )

  /* handle any path part replacement */
  let url = redirectaddress( req.url )
  req.url = url;
  let data = "";

  const parts = getURLParts( url )

  /* check whether service and if so call */
  if( parts.route.slice( 1 ) in services.available ) {
    data = await invokeService( parts.route.slice( 1 ), parts, req, res )
  }
  /* get file or make proxy request */
  else {
    const filename = ( "/" == url ) ? url += "index.html" : parts.route
    data = await handleFileOrProxy( req, res, filename )
  }

  if( "proxied" == data ) return

  const filext = /(?:\.([^.]+))?$/.exec( req.url )
  const mimetype = mimemap[ filext[ 0 ] ] || "text/html"

  res.setHeader( "Content-Type", mimetype )
  res.setHeader( "Cache-Control", "public, max-age=0" );
  res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

  res.writeHead( 200 )
  res.end( data )
} )

server.listen( port, host, () => {
  console.log( `Serving from directory ${localwebroot} at http://${host}:${port}` )
} )

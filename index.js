const http = require( "http" )
const https = require( "https" )
const path = require( "path" )
const fs = require( "fs" ).promises

const config = require( "config" )

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

const localwebroot = config.get( "devweb.localwebroot" )
const weblocation = config.get( "devweb.proxyhost" )
const accesstoken = config.get( "devweb.accesstoken" )
const addressredirects = config.get( "devweb.addressredirects" )
const mimemap = config.get( "devweb.mimemap" )
const servicefilepath = config.get ( "devweb.servicefilepath" )

/*
  Services can be made available from the service file path in config:
  module.exports.available = {
    service1Name: async function() {
      // return data
    }
  };
*/

let services = { available: {} };

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

  An option flag is defined in an object included in the flags array:
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

  const filename = path.basename( __filename )
  const args = process.argv.slice( process.argv.indexOf( filename ) )

  const flags = [
    {
      long: "help",
      short: "h",
      intent: "show help text",
      action: () => {
        const optionsStr = flags.map( f => [ f.long && " --" + f.long, f.short && " -" + f.short, f.intent && f.intent ].join( "\t" ) ).join( "\n" )
        console.log( "Options:\n" + optionsStr )
        process.exit()
      }
    }
  ]

  args.forEach( async ownArg => {
    // check whether flag and apply
    flags.forEach( ownFlag => {
      if( ownArg === "-" + ownFlag.short || ownArg === "--" + ownFlag.long ) ownFlag.action()
    } )
    // check whether service and call
    const parts = getURLParts( ownArg )
    if( parts.route[ 0 ] === "/" && parts.route.slice( 1 ) in services.available ) {
      await handleService( parts.route.slice( 1 ), parts )
    }
  } )
}

function proxrequest( req, res, data ) {

  const options = {
    host: weblocation,
    path: req.url,
    method: req.method,
    headers: {
      'Authorization': `Bearer ${accesstoken}`,
    }
  }

  if( "GET" != req.method ) {
    options.headers[ "Content-Type" ] = req.headers[ "content-type" ]
    options.headers[ "Content-Length" ] = req.headers[ "content-length" ]
  }

  const httpsreq = https.request(options, (resp) => {

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

function redirectaddress( addr ) {
  for (key in addressredirects) {
    if( 0 == addr.indexOf( key ) ) {
      addr = addr.replace( key, addressredirects[ key ] );
      console.log( `Redirecting to ${ addr }` )
    }
  }
  return addr
}

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

async function handleService( service, parts, req = {}, res = {} ) {
  console.log( `Calling service ${ service }` )
  return await services.available[ service ]( config, parts, req.body )
}

const handleFileOrProxy = async function( req, res, filename ) {

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

const server = http.createServer( async function ( req, res ) {

  console.log( "Received request:", req.method, req.url )

  let url = redirectaddress( req.url )
  req.url = url;
  let data = "";

  const parts = getURLParts( url )

  // check whether service and call
  if( parts.route.slice( 1 ) in services.available ) {
    data = await handleService( parts.route.slice( 1 ), parts, req, res )
  // get file or make proxy request
  }
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

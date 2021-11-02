const http = require( "http" )
const https = require( "https" )
const path = require( "path" )
const fs = require( "fs" ).promises
const config = require( "config" )

const host = "localhost"
const port = 8000

/*
  You will require a /config/default.json:
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
  Services can be provided in a /services.js:
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
    services = require( servicefilepath )
    handleArgs()
  } )
  .catch( err => {
    console.log( "No services.js found" )
  } )

/*
  Arguments can be passed after the filename:
  > node index.js --flag /service?key=value
*/

function handleArgs() {

  const ownName = path.basename( __filename )
  const ownArgs = process.argv.slice( process.argv.indexOf( ownName ) )

  const ownFlags = []

  ownArgs.forEach( async ownArg => {
    // check whether flag and apply
    ownFlags.forEach( ownFlag => {
      if( ownArg === "-" + ownFlag.short || ownArg === "--" + ownFlag.long ) ownFlag.action()
    } )
    // check whether service and call
    const parts = getURLParts( ownArg )
    if( parts.route[ 0 ] === "/" && parts.route.slice( 1 ) in services.available ) {
      await handleService( parts.route.slice( 1 ), parts )
    }
  } )
}

function proxgetrequest( req, res ) {
  //GET verb only
  const options = {
    host: weblocation,
    path: req.url,
    method: "GET",
    headers: {
      'Authorization': `Bearer ${accesstoken}`
    }
  }
  var httpsreq = https.request(options, (resp) => {
    console.log('statusCode:', resp.statusCode)
    console.log('headers:', resp.headers)
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
    res.end( "Sorry" )
  } )
  httpsreq.end()
}

function proxrequest( req, res, data ) {
  //handles POST, PUT and DELETE
  options = {
    host: weblocation,
    path: req.url,
    method: req.method,
    headers: {
      'Authorization': `Bearer ${accesstoken}`,
      'Content-Type': req.headers["content-type"],
      'Content-Length': req.headers["content-length"]
    }
  }
  var httpsreq = https.request(options, (resp) => {
    console.log('statusCode:', resp.statusCode)
    console.log('headers:', resp.headers)
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
    res.end( "Sorry" )
  } )
  httpsreq.write(data)
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
  return await services.available[ service ]( servicefilepath, parts, req.body )
}

const handleFileOrProxy = async function( req, res, filename ) {

  try {

    data = await fs.readFile( localwebroot + filename, "utf8" )
    console.log( `Serving local copy of ${ filename.slice( 1 ) }` )

  } catch {

    console.log( `Passing request to server` )
    if( "GET" == req.method ) {
      proxgetrequest( req, res )
    } else {
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
  } else {
    let filename = ( "/" == url ) ? url += "index.html" : parts.route
    data = await handleFileOrProxy( req, res, filename )
  }

  if( "proxied" == data ) return

  let filext = /(?:\.([^.]+))?$/.exec( req.url )
  let mimetype = mimemap[ filext[ 0 ] ]
  if( undefined === mimetype ) mimetype = "text/html"

  res.setHeader( "Content-Type", mimetype )
  res.setHeader( "Cache-Control", "public, max-age=0" );
  res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

  res.writeHead( 200 )
  res.end( data )

} )

server.listen( port, host, () => {
  console.log( `Serving from directory ${localwebroot} at http://${host}:${port}` )
} )

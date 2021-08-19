const http = require( "http" )
const https = require( "https" )
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
    service1Name: function() {
      // return data
    }
  };
*/

let services = { available: {} };

fs.access( servicefilepath  )
  .then( res => {
    console.log( "Including services.js." )
    services = require( "./services.js" )
  } )
  .catch( err => {
    console.log( "No services.js found." )
  } )

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
    }
  }
  return addr
}

const handleService = async function( req, res, service ) {
  return await services.available[ service ]()
}

const handleFileOrProxy = async function( req, res, filename ) {
    try {
      data = await fs.readFile( localwebroot + filename, "utf8" )
      console.log( `Received a request for ${req.url} and we have a local copy we can use` )
    } catch {
      console.log( `Received a request for ${req.url} but need to request from our server` )
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

  let url = redirectaddress( req.url )
  let data = "";

  // check whether service and call
  if( url.slice( 1 ) in services.available ) {
    data = await handleService( req, res, url.slice( 1 ) )
  // get file or make proxy request
  } else {
    let filename = ( "/" == url ) ? url += "index.html" : url
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

  console.log(req.url)
  console.log(req.method)

} )

server.listen( port, host, () => {
  console.log( `Server is running on http://${host}:${port}` )
} )

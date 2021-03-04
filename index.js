const http = require( "http" )
const https = require( "https" )
const fs = require( "fs" )
const config = require( "config" )

const host = "localhost"
const port = 8000

/*
You will require a /config/default.json:

{
  "devweb": {
    "localwebroot": "/home/nick/workspace/babble_web/babblevoice",
    "proxyhost": "https://www.babblevoice.com",
    "accesstoken": ""
  }
}
*/

const localwebroot = config.get( "devweb.localwebroot" )
const weblocation = config.get( "devweb.proxyhost" )
const accesstoken = config.get( "devweb.accesstoken" )

const mimemap = {
  ".js": "application/javascript",
  ".html": "text/html",
  ".css": "text/css"
}

function proxrequest( req, res ) {

  https.get( weblocation + req.url, ( resp ) => {

    //console.log( resp )
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

  } ).on( "error", ( err ) => {
    res.writeHead( 500 )
    res.end( "Sorry" )
  } )
}

const server = http.createServer( function ( req, res ) {

  let actualfile = req.url
  if( "/" == actualfile.slice( -1 ) ) actualfile += "index.html"

  fs.readFile( localwebroot + actualfile, "utf8", function ( err, data ) {
    if ( err ) {
      console.log( `Received a request for ${req.url} but need to request from our server` )
      proxrequest( req, res )
      return
    }

    console.log( `Received a request for ${req.url} and we have a local copy we can use` )

    let filext = /(?:\.([^.]+))?$/.exec( req.url )
    let mimetype = mimemap[ filext[ 0 ] ]
    if( undefined === mimetype ) mimetype = "text/html"

    res.setHeader( "Content-Type", mimetype )
    res.setHeader( "Cache-Control", "public, max-age=0" );
    res.setHeader( "Expires", new Date( Date.now() ).toUTCString() )

    res.writeHead( 200 )
    res.end( data )

  } )

  console.log(req.url)
  console.log(req.method)

} )

server.listen( port, host, () => {
  console.log( `Server is running on http://${host}:${port}` )
} )

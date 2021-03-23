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

const rit_token = "76d240775930f218b59a837e7210382201cdfa06"

function proxgetrequest( req, res ) {
  //GET verb only
  const options = {
    host: weblocation,
    path: req.url,
    method: "GET",
    headers: {
      'Authorization': `Bearer ${rit_token}`
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
      'Authorization': `Bearer ${rit_token}`,
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

const server = http.createServer( function ( req, res ) {

  let actualfile = req.url
  if( 0 == actualfile.indexOf( "/a/" ) ) {
    actualfile = actualfile.replace( "/a/", "/calendar/" );
  }
  if( "/" == actualfile.slice( -1 ) ) actualfile += "index.html"

  fs.readFile( localwebroot + actualfile, "utf8", function ( err, data ) {

    if ( err ) {
      console.log( `Received a request for ${req.url} but need to request from our server` )

      if( "GET" == req.method ) {
        proxgetrequest( req, res )
        return
      } else {
        let data = '';
        req.on('data', chunk => {
          data += chunk;
        })
        req.on('end', () => {
          proxrequest( req, res, data )
        })
        return
      }
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

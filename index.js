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
    "localwebroot": "C:/Users/Bueno/Documents/GitHub/arit-calendar/out",
    "proxyhost": "www.aroomintown.com",
    "rittoken": "b225dfc4466f7cad0c519d6082703b1943b335fa",
    "addressredirects" : {
      "/a/": "/calendar/"
    },
    "mimemap": {
      ".js": "application/javascript",
      ".html": "text/html",
      ".css": "text/css"
    }
  }
}
*/

const localwebroot = config.get( "devweb.localwebroot" )
const weblocation = config.get( "devweb.proxyhost" )
const rittoken = config.get( "devweb.rittoken" )
const addressredirects = config.get( "devweb.addressredirects" )
const mimemap = config.get( "devweb.mimemap" )

function proxgetrequest( req, res ) {
  //GET verb only
  const options = {
    host: weblocation,
    path: req.url,
    method: "GET",
    headers: {
      'Authorization': `Bearer ${rittoken}`
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
      'Authorization': `Bearer ${rittoken}`,
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

const server = http.createServer( function ( req, res ) {

  let actualfile = redirectaddress( req.url )
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

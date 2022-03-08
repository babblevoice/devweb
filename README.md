# devweb

A simple web proxy server to help develop a local web app against a remote API server (or similar structure).

## Installation

The file package.json lists the packages used. There are currently two, the dependency `config`, which is required, and the devDependency `nodemon`, which is optional.

To install all dependencies and devDependencies:

```shell
npm install
```

To install dependencies only, omitting devDependencies:

```shell
npm install --only=prod
```

## Configuration

You will require a config directory containing a default.json file, with content corresponding to the following structure:

```json
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
    "servicefilepath": "./services.js",
    "verbosity": "normal"
  }
}
```

### Verbosity

Four levels of verbosity are available:

- `silent`
- `quiet`
- `normal`, the default value
- `verbose`

Logging at `normal` includes the response status code and headers, while logging at `verbose` includes also the stats object for each local file served and the request headers passed onward.

### Other config items

Other config items may be added, notably an `extractioncriteria` array.

If an `extractioncriteria` array is present in the configuration file, it will be used in determining whether the request body should be extracted. The array may contain one or both of the strings `"method"` and `"header"`, with the following cumulative effects:

- `"method"` - extract the request body if the request method is not `GET`
- `"header"` - extract the request body if one or both of the `Content-Length` and `Transfer-Encoding` headers is set

The default `extractioncriteria` value is `[ "method" ]`, i.e. extract if the request method is not `GET`.

## Server startup

The server can be started with the `node` command:

```shell
node index.js
```

If `nodemon` is installed (see [Installation](#installation) above), the server can be started with the `nodemon` command, which will restart it automatically on file change:

```shell
nodemon index.js
```

The server runs at `localhost:8000`.

## Startup arguments

One or more arguments can be passed to the server at startup. These are listed after the name of the file. Each argument is assumed to be:

- an option flag, whether long form or short
- a service name (see [Service provision](#service-provision) below) in URL format

```shell
node index.js --flag -f /service?key=value
```

Any option flags passed are parsed first to allow a service file path to be set or overridden, then any service names.

## Option definition

Each option is defined in an object included in the `options` array. The object should include a function to be invoked if the flag is passed (`action`), the flag itself in one or both of a long form (`long`) or short form (`short`) and the number of arguments expected (`params`, default 0), and may include a summary of the action performed (`intent`).

```js
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
```

## Default options

Six default options are available:

- `--config/-c`, to show the devweb config object then exit
- `--set/-s`, to set a config item, overriding if present or adding otherwise
- `--silent/-S`, to set the verbosity config item to `silent`
- `--quiet/-q`, to set the verbosity config item to `quiet`
- `--verbose/-v`, to set the verbosity config item to `verbose`
- `--help/-h`, to show the help text then exit

## Service provision

Services can be provided in a services.js file, with content corresponding to the following structure:

```js
module.exports.available = {
  service1Name: async function( config, parts, data ) {
    // return result
  }
};
```

If the services.js file is found at the service file path specified in config/default.json, the methods on its `available` object are imported. If a route called matches the name of a method, the method is invoked and its return value passed back.

The following values are passed to each method:

1. the object parsed from the JSON config (`config`)
2. the object returned from the utility function `getURLParts` invoked with the request URL (`parts`)
3. the request body (`data`), if extracted (see [Other config items](#other-config-items) above), else `undefined`
4. the lifecycle hooks object (`lifecycleHooks`)

## Lifecycle hooks

Callbacks to be invoked at given points in the request-response lifecycle can be stored on the `lifecycleHooks` object, each callback as a method on the nested object for the given lifecycle stage. Each method on a nested object is called once at the corresponding lifecycle stage.

The following values are passed to each method:

1. the request object (`req`)
2. the response object (`res`)

### Lifecycle stages

Two lifecycle stages are currently supported:

1. request receive, callbacks for which can be stored as methods on `lifecycleHooks.onRequestReceive`
2. response send, callbacks for which can be stored as methods on `lifecycleHooks.onResponseSend`

# devweb

A simple web proxy server to help develop a local web app against a remote api server (or similar structure).

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
    "servicefilepath": "./services.js"
  }
}
```

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

## Option definition

Each option is defined in an object included in the `flags` array. The object should include a function to be invoked if the flag is passed (`action`) and the flag itself in one or both of a long form (`long`) or short form (`short`), and may include a summary of the action performed (`intent`).

```js
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
```

## Service provision

Services can be provided in a services.js file, with content corresponding to the following structure:

```js
module.exports.available = {
  service1Name: async function() {
    // return data
  }
};
```

If the services.js file is found at the service file path specified in config/default.json, the methods on its `available` object are imported. If a route called matches the name of a method, the method is invoked and its return value passed back.

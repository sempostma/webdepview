# webdepview

Gives a good indication of your node_modules slug size.

## Install 

```bash
npm i -g webdepview
```

## Usage

Make sure you're project has a package-lock.json file. 
Run npm install with the latest version of npm to ensure you have a valid package-lock.json file.

```bash
webdepview # current directory
webdepview directory # specific directory (relative or absolute)
webdepview --ignore-dev # ignore dev dependencies
```

License: MIT

# Rugo Live

Live bundle for Rugo.

## Usage

```js
const live = goLive({
  root: '/your project root',
  src: './source/directory', // related with root, default is ./src
  public: './public/directory', // related with root, default is ./public
  dst: './dist/directory', // directory to put result, default is ./dist
  static: 'statics', // static directory name, default is 'statics' at ./dist/statics
  view: 'views', // view directory name, default is 'views' at ./dist/views
});

await live.build();

/* or */

live.watch();
```

## Project

```text
|- src/
|- public/
|- .gitignore
|- postcss.config.js
|- tailwind.config.js
|- package.json
```

It will scan /src and /public to build.

## Vite Project

Build your own Rugo + Vite project.

```bash
cd <your-project>
npm init -y
npm install -D vite
npm install -D @rugo-vn/live
```

Update `package.json`

```json
{
  "scripts": {
    "dev": "live",
    "build": "live --build"
  }
}
```

Create `vite.config.js`

```js

```

## License

MIT.

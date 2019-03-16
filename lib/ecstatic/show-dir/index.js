'use strict';

const styles = require('./styles');
const permsToString = require('./perms-to-string');
const sizeToString = require('./size-to-string');
const sortFiles = require('./sort-files');
const fs = require('fs');
const path = require('path');
const he = require('he');
const etag = require('../etag');
const url = require('url');
const status = require('../status-handlers');

const supportedIcons = styles.icons;
const css = styles.css;

module.exports = (opts) => {
  // opts are parsed by opts.js, defaults already applied
  const cache = opts.cache;
  const root = path.resolve(opts.root);
  const baseDir = opts.baseDir;
  const humanReadable = opts.humanReadable;
  const hidePermissions = opts.hidePermissions;
  const handleError = opts.handleError;
  const showDotfiles = opts.showDotfiles;
  const si = opts.si;
  const weakEtags = opts.weakEtags;

  return function middleware(req, res, next) {
    // Figure out the path for the file from the given url
    const parsed = url.parse(req.url);
    const pathname = decodeURIComponent(parsed.pathname);
    const dir = path.normalize(
      path.join(
        root,
        path.relative(
          path.join('/', baseDir),
          pathname
        )
      )
    );

    fs.stat(dir, (statErr, stat) => {
      if (statErr) {
        if (handleError) {
          status[500](res, next, {error: statErr});
        } else {
          next();
        }
        return;
      }

      // files are the listing of dir
      fs.readdir(dir, (readErr, _files) => {
        let files = _files;

        if (readErr) {
          if (handleError) {
            status[500](res, next, {error: readErr});
          } else {
            next();
          }
          return;
        }

        // Optionally exclude dotfiles from directory listing.
        if (!showDotfiles) {
          files = files.filter(filename => filename.slice(0, 1) !== '.');
        }

        res.setHeader('content-type', 'text/html');
        res.setHeader('etag', etag(stat, weakEtags));
        res.setHeader('last-modified', (new Date(stat.mtime)).toUTCString());
        res.setHeader('cache-control', cache);

        function render(dirs, renderFiles, lolwuts) {
          // each entry in the array is a [name, stat] tuple

          let html = `${[
            '<!doctype html>',
            '<html>',
            '  <head>',
            '    <meta charset="utf-8">',
            '    <meta name="viewport" content="width=device-width">',
            `    <meta http-equiv="X-UA-Compatible" content="IE=edge;chrome=1">`,
            `    <meta name="renderer" content="webkit">`,
            `    <meta name="viewport" content="width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0,user-scalable=no">`,
            `    <title>Index of ${he.encode(pathname)}</title>`,
            `    <style type="text/css">${css}</style>`,
            '  </head>',
            '  <body>',
            `<h1>Index of ${he.encode(pathname)}</h1>`,
          ].join('\n')}\n`;

          const styles = `
            <style>
              h1 {
                margin: 0;
              }
              body {
                position: relative;
                min-height: 100vh;
                margin: 0;
                padding-bottom: 35px;
              } 
              *{
                box-sizing: border-box;
              }           
              #shalong {
                position: absolute;
                min-height: 100%;
                width: 100%;
                top: 0;
                left: 0;
                display: none;
                background-color: black;
                margin-bottom: 35px;
              }
              
              #shalong img {
                width: 100%;
              }
              
              .toolbox {
                position: fixed;
                bottom: 0;
                height: 35px;
                width: 100%;
                background-color: black;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: white;
              }
              .toolbox button {
                height: 100%;
                background-color: #eee;
                font-size: 18px;
              }
            </style>          
          `;
          html += styles;
          html += '<table>';

          const failed = false;
          const writeRow = (file) => {
            // render a row given a [name, stat] tuple
            const isDir = file[1].isDirectory && file[1].isDirectory();
            let href = `${parsed.pathname.replace(/\/$/, '')}/${encodeURIComponent(file[0])}`;

            // append trailing slash and query for dir entry
            if (isDir) {
              href += `/${he.encode((parsed.search) ? parsed.search : '')}`;
            }

            const displayName = he.encode(file[0]) + ((isDir) ? '/' : '');
            const ext = file[0].split('.').pop();
            const classForNonDir = supportedIcons[ext] ? ext : '_page';
            const iconClass = `icon-${isDir ? '_blank' : classForNonDir}`;

            // TODO: use stylessheets?
            html += `${'<tr>' +
            '<td><i class="icon '}${iconClass}"></i></td>`;
            if (!hidePermissions) {
              html += `<td class="perms"><code>(${permsToString(file[1])})</code></td>`;
            }
            html +=
              `<td class="file-size"><code>${sizeToString(file[1], humanReadable, si)}</code></td>` +
              `<td class="display-name"><a href="${href}">${displayName}</a></td>` +
              '</tr>\n';
          };

          renderFiles = renderFiles.sort((a, b) => {
            const va = parseInt(a[0].split('.')[0]);
            const vb = parseInt(b[0].split('.')[0]);
            if (va < vb) {
              return -1;
            } else if (va > vb) {
              return 1;
            } else {
              return 0;
            }
          });
          let hrefs = renderFiles.filter((file) => {
            return /\.(png|jpe?g|gif|svg|bmp)(\?.*)?$/.test(file[0]);
          }).map(file => {
            return `${parsed.pathname.replace(/\/$/, '')}/${encodeURIComponent(file[0])}`;
          });

          dirs.sort((a, b) => a[0].toString().localeCompare(b[0].toString())).forEach(writeRow);
          renderFiles.forEach(writeRow);
          lolwuts.sort((a, b) => a[0].toString().localeCompare(b[0].toString())).forEach(writeRow);

          html += '</table>\n';
          html += `<br><address>Node.js ${
              process.version
              }/ <a href="https://github.com/jfhbrook/node-ecstatic">ecstatic</a> ` +
            `server running @ ${
              he.encode(req.headers.host || '')}</address>\n`;

          if (hrefs.length > 0) {
            html += `<div id="shalong">`;
            for (const href of hrefs) {
              html += `<img src='${href}'/>`
            }
            html += `</div>`;
            html += `<div class="toolbox"><button id="show">SHOW</button><button id="close">CLOSE</button></div>`;
            html += `<script>
              document.getElementById('show').addEventListener('click', function(){
                document.getElementById('shalong').setAttribute('style', 'display: block');
              });
              document.getElementById('close').addEventListener('click', function(){
                document.getElementById('shalong').setAttribute('style', 'display: none');
              });
            </script>`
          }


          html += `</body></html>`;

          if (!failed) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(html);
          }
        }

        sortFiles(dir, files, (lolwuts, dirs, sortedFiles) => {
          // It's possible to get stat errors for all sorts of reasons here.
          // Unfortunately, our two choices are to either bail completely,
          // or just truck along as though everything's cool. In this case,
          // I decided to just tack them on as "??!?" items along with dirs
          // and files.
          //
          // Whatever.

          // if it makes sense to, add a .. link
          if (path.resolve(dir, '..').slice(0, root.length) === root) {
            fs.stat(path.join(dir, '..'), (err, s) => {
              if (err) {
                if (handleError) {
                  status[500](res, next, {error: err});
                } else {
                  next();
                }
                return;
              }
              dirs.unshift(['..', s]);
              render(dirs, sortedFiles, lolwuts);
            });
          } else {
            render(dirs, sortedFiles, lolwuts);
          }
        });
      });
    });
  };
};

'use strict';
const http = require('node:http');
const {buildFixture} = require('./fixture');
const server = http.createServer((request,response)=>{
  if (request.url!=='/') {response.writeHead(404);response.end();return;}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  response.end(buildFixture());
});
server.listen(0,'127.0.0.1',()=>console.log('Fixture: http://127.0.0.1:'+server.address().port+'/'));

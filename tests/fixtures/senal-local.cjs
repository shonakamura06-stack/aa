// Solo para las pruebas: el proceso se termina al concluir la suite.
const http=require('node:http');
const express=require(process.env.EXPRESS_MODULE || 'express');
const {ExpressPeerServer}=require(process.env.PEER_MODULE || 'peer');
const app=express(), server=http.createServer(app);
app.use('/signal',ExpressPeerServer(server,{path:'/'}));
server.listen(0,'127.0.0.1',()=>process.send(server.address().port));

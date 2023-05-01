// Importar dependencias
const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

//Importar clases
const {LiveGames} = require('./utils/liveGames');
const {Players} = require('./utils/players');

const publicPath = path.join(__dirname, '../public');
var app = express();
var server = http.createServer(app);
var io = socketIO(server);
var games = new LiveGames();
var players = new Players();

// Configuraciones de Mongodb
var MongoClient = require('mongodb').MongoClient;
var mongoose = require('mongoose');
var url = "mongodb://localhost:27017/";

// Configuración de express para servir archivos estáticos desde la carpeta public
app.use(express.static(publicPath));

// Iniciar servidor en el puerto 3000
server.listen(3000, () => {
    console.log("Server started on port 3000");
});

// Cuando se establece una conexión entre cliente y servidor
io.on('connection', (socket) => {
    
    //Evento que se dispara cuando el host se conecta por primera vez
    socket.on('host-join', (data) =>{
        
        // Verificar si el id pasado en la URL corresponde al id de un juego de kahoot en la base de datos
        MongoClient.connect(url, function(err, db) {
            if (err) throw err;
            var dbo = db.db("kahootDB");
            var query = { id:  parseInt(data.id)};
            dbo.collection('kahootGames').find(query).toArray(function(err, result){
                if(err) throw err;
                
                // Si se encontró un juego de kahoot con el id pasado en la URL
                if(result[0] !== undefined){
                    var gamePin = Math.floor(Math.random()*90000) + 10000; //new pin for game

                    games.addGame(gamePin, socket.id, false, {playersAnswered: 0, questionLive: false, gameid: data.id, question: 1}); //Creates a game with pin and host id

                    var game = games.getGame(socket.id); //Gets the game data

                    socket.join(game.pin);//The host is joining a room based on the pin

                    console.log('Game Created with pin:', game.pin); 

                    //Enviar el código PIN del juego al host para que lo muestre a los jugadores que se unan
                    socket.emit('showGamePin', {
                        pin: game.pin
                    });
                }else{
                    socket.emit('noGameFound');
                }
                db.close();
            });
        });
        
    });
    
    //Cuando el host se conecta desde la vista del juego
    socket.on('host-join-game', (data) => {
        var oldHostId = data.id;
        var game = games.getGame(oldHostId);//Obtiene el juego con el ID del host antiguo
        if(game){
            game.hostId = socket.id;//Cambia el ID del host en el juego con el nuevo ID del host
            socket.join(game.pin);
            var playerData = players.getPlayers(oldHostId);// Obtiene los jugadores del juego usando el ID del host antiguo
            for(var i = 0; i < Object.keys(players.players).length; i++){
                if(players.players[i].hostId == oldHostId){
                    players.players[i].hostId = socket.id;
                }
            }
            var gameid = game.gameData['gameid'];
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('kahootDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("kahootGames").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    
                    var question = res[0].questions[0].question;
                    var answer1 = res[0].questions[0].answers[0];
                    var answer2 = res[0].questions[0].answers[1];
                    var answer3 = res[0].questions[0].answers[2];
                    var answer4 = res[0].questions[0].answers[3];
                    var correctAnswer = res[0].questions[0].correct;
                    
                    socket.emit('gameQuestions', {
                        q1: question,
                        a1: answer1,
                        a2: answer2,
                        a3: answer3,
                        a4: answer4,
                        correct: correctAnswer,
                        playersInGame: playerData.length
                    });
                    db.close();
                });
            });
            
            
            io.to(game.pin).emit('gameStartedPlayer');
            game.gameData.questionLive = true;
        }else{
            socket.emit('noGameFound');//No game was found, redirect user
        }
    });
    
    //Cuando el jugador se conecta por primera vez
    socket.on('player-join', (params) => {
        
        var gameFound = false; //Si se encuentra un juego con la clave proporcionada por el jugador
        
        //Para cada juego en la clase Games
        for(var i = 0; i < games.games.length; i++){
            //Si la clave es igual a la clave de uno de los juegos
            if(params.pin == games.games[i].pin){
                
                console.log('Player connected to game');
                
                var hostId = games.games[i].hostId; //Obtenemos la ID del host del juego
                
                
                players.addPlayer(hostId, socket.id, params.name, {score: 0, answer: 0}); //Agregamos al jugador al juego
                
                socket.join(params.pin); //El jugador se une a la sala del juego basado en la clave
                
                var playersInGame = players.getPlayers(hostId); //Obtenemos a todos los jugadores en el juego
                
                io.to(params.pin).emit('updatePlayerLobby', playersInGame);//Enviamos la información de los jugadores al host para su visualización
                gameFound = true; //El juego ha sido encontrado
            }
        }
        
        //Si no se ha encontrado el juego
        if(gameFound == false){
            socket.emit('noGameFound'); //El jugador es enviado a la página de 'join' porque no se encontró el juego con la clave
        }
        
        
    });
    
    //Cuando el jugador se conecta desde la vista del juego
    socket.on('player-join-game', (data) => {
        var player = players.getPlayer(data.id);
        if(player){
            var game = games.getGame(player.hostId);
            socket.join(game.pin);
            player.playerId = socket.id;//Actualizar la ID del jugador con la ID del socket
            
            var playerData = players.getPlayers(game.hostId);
            socket.emit('playerGameData', playerData);
        }else{
            socket.emit('noGameFound');//No se encontró al jugador
        }
        
    });
    
    //Cuando un anfitrión o jugador abandona
    socket.on('disconnect', () => {
        var game = games.getGame(socket.id); //Buscamos el juego con la ID del socket 
        //Si se encuentra un juego alojado con esa ID, el socket desconectado es el anfitrión
        if(game){
            //Comprobamos si el anfitrión fue desconectado o enviado a la vista del juego
            if(game.gameLive == false){
                games.removeGame(socket.id);//Eliminamos el juego de la instancia de la clase Games
                console.log('Game ended with pin:', game.pin);

                var playersToRemove = players.getPlayers(game.hostId); //Obtenemos a todos los jugadores en el juego

                //For each player in the game
                for(var i = 0; i < playersToRemove.length; i++){
                    players.removePlayer(playersToRemove[i].playerId); //Eliminamos a cada jugador de la instancia de la clase Players 
                }

                io.to(game.pin).emit('hostDisconnect'); //Enviar al jugador de vuelta a la pantalla de 'unirse'
                socket.leave(game.pin); //El socket abandona la sala
            }
        }else{
            //Si no se ha encontrado un juego, entonces es el socket de un jugador que se ha desconectado
            var player = players.getPlayer(socket.id); //Obtener información del jugador con socket.id
            
            //Si se ha encontrado un jugador con esa ID
            if(player){
                var hostId = player.hostId;//Obtener el ID del anfitrión del juego
                var game = games.getGame(hostId);//Obtener los datos del juego con el ID del anfitrión
                var pin = game.pin;//Obtener el PIN del juego
                
                if(game.gameLive == false){
                    players.removePlayer(socket.id);//Remover jugador de la clase de players
                    var playersInGame = players.getPlayers(hostId);//Obtener los restantes jugadores del juego

                    io.to(pin).emit('updatePlayerLobby', playersInGame);//Enviar datos al anfitrión del juego para actualizar su pantalla
                    socket.leave(pin); //El jugador dejó la sala del juego
            
                }
            }
        }
        
    });
    
    //Configurar la selección de una respuesta por parte del jugador
    socket.on('playerAnswer', function(num){
        var player = players.getPlayer(socket.id);
        var hostId = player.hostId;
        var playerNum = players.getPlayers(hostId);
        var game = games.getGame(hostId);
        
        if(game.gameData.questionLive == true){// Si todavía se está presentando la pregunta
            player.gameData.answer = num;
            game.gameData.playersAnswered += 1;
            
            var gameQuestion = game.gameData.question;
            var gameid = game.gameData.gameid;
            
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('kahootDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("kahootGames").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    var correctAnswer = res[0].questions[gameQuestion - 1].correct;
                    //Verificar si la respuesta del jugador es correcta
                    if(num == correctAnswer){
                        player.gameData.score += 100;
                        io.to(game.pin).emit('getTime', socket.id);
                        socket.emit('answerResult', true);
                    }

                    //Verificar si todos los jugadores han respondido
                    if(game.gameData.playersAnswered == playerNum.length){
                        game.gameData.questionLive = false; //La pregunta ha terminado porque todos los jugadores respondieron
                        var playerData = players.getPlayers(game.hostId);
                        io.to(game.pin).emit('questionOver', playerData, correctAnswer);//Notificar a todos los jugadores que la preguta ha terminado
                    }else{
                        //Actualizar la pantalla del anfitrión del juego con el número de jugadores que han respondido
                        io.to(game.pin).emit('updatePlayersAnswered', {
                            playersInGame: playerNum.length,
                            playersAnswered: game.gameData.playersAnswered
                        });
                    }
                    
                    db.close();
                });
            });
            
            
            
        }
    });
    
    socket.on('getScore', function(){
        var player = players.getPlayer(socket.id);
        socket.emit('newScore', player.gameData.score); 
    });
    
    socket.on('time', function(data){
        var time = data.time / 20;
        time = time * 100;
        var playerid = data.player;
        var player = players.getPlayer(playerid);
        player.gameData.score += time;
    });
    
    
    
    socket.on('timeUp', function(){
        var game = games.getGame(socket.id);
        game.gameData.questionLive = false;
        var playerData = players.getPlayers(game.hostId);
        
        var gameQuestion = game.gameData.question;
        var gameid = game.gameData.gameid;
            
            MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('kahootDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("kahootGames").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    var correctAnswer = res[0].questions[gameQuestion - 1].correct;
                    io.to(game.pin).emit('questionOver', playerData, correctAnswer);
                    
                    db.close();
                });
            });
    });
    
    socket.on('nextQuestion', function(){
        var playerData = players.getPlayers(socket.id);
        //Restablecer la respuesta actual de los jugadores a 0
        for(var i = 0; i < Object.keys(players.players).length; i++){
            if(players.players[i].hostId == socket.id){
                players.players[i].gameData.answer = 0;
            }
        }
        
        var game = games.getGame(socket.id);
        game.gameData.playersAnswered = 0;
        game.gameData.questionLive = true;
        game.gameData.question += 1;
        var gameid = game.gameData.gameid;
        
        
        
        MongoClient.connect(url, function(err, db){
                if (err) throw err;
    
                var dbo = db.db('kahootDB');
                var query = { id:  parseInt(gameid)};
                dbo.collection("kahootGames").find(query).toArray(function(err, res) {
                    if (err) throw err;
                    
                    if(res[0].questions.length >= game.gameData.question){
                        var questionNum = game.gameData.question;
                        questionNum = questionNum - 1;
                        var question = res[0].questions[questionNum].question;
                        var answer1 = res[0].questions[questionNum].answers[0];
                        var answer2 = res[0].questions[questionNum].answers[1];
                        var answer3 = res[0].questions[questionNum].answers[2];
                        var answer4 = res[0].questions[questionNum].answers[3];
                        var correctAnswer = res[0].questions[questionNum].correct;

                        socket.emit('gameQuestions', {
                            q1: question,
                            a1: answer1,
                            a2: answer2,
                            a3: answer3,
                            a4: answer4,
                            correct: correctAnswer,
                            playersInGame: playerData.length
                        });
                        db.close();
                    }else{
                        var playersInGame = players.getPlayers(game.hostId);
                        var first = {name: "", score: 0};
                        var second = {name: "", score: 0};
                        var third = {name: "", score: 0};
                        var fourth = {name: "", score: 0};
                        var fifth = {name: "", score: 0};
                        
                        for(var i = 0; i < playersInGame.length; i++){
                            console.log(playersInGame[i].gameData.score);
                            if(playersInGame[i].gameData.score > fifth.score){
                                if(playersInGame[i].gameData.score > fourth.score){
                                    if(playersInGame[i].gameData.score > third.score){
                                        if(playersInGame[i].gameData.score > second.score){
                                            if(playersInGame[i].gameData.score > first.score){
                                                //Primer Lugar
                                                fifth.name = fourth.name;
                                                fifth.score = fourth.score;
                                                
                                                fourth.name = third.name;
                                                fourth.score = third.score;
                                                
                                                third.name = second.name;
                                                third.score = second.score;
                                                
                                                second.name = first.name;
                                                second.score = first.score;
                                                
                                                first.name = playersInGame[i].name;
                                                first.score = playersInGame[i].gameData.score;
                                            }else{
                                                //Segundo Lugar
                                                fifth.name = fourth.name;
                                                fifth.score = fourth.score;
                                                
                                                fourth.name = third.name;
                                                fourth.score = third.score;
                                                
                                                third.name = second.name;
                                                third.score = second.score;
                                                
                                                second.name = playersInGame[i].name;
                                                second.score = playersInGame[i].gameData.score;
                                            }
                                        }else{
                                            //Tercer Lugar
                                            fifth.name = fourth.name;
                                            fifth.score = fourth.score;
                                                
                                            fourth.name = third.name;
                                            fourth.score = third.score;
                                            
                                            third.name = playersInGame[i].name;
                                            third.score = playersInGame[i].gameData.score;
                                        }
                                    }else{
                                        //Cuarto Lugar
                                        fifth.name = fourth.name;
                                        fifth.score = fourth.score;
                                        
                                        fourth.name = playersInGame[i].name;
                                        fourth.score = playersInGame[i].gameData.score;
                                    }
                                }else{
                                    //Quinto Lugar
                                    fifth.name = playersInGame[i].name;
                                    fifth.score = playersInGame[i].gameData.score;
                                }
                            }
                        }
                        
                        io.to(game.pin).emit('GameOver', {
                            num1: first.name,
                            num2: second.name,
                            num3: third.name,
                            num4: fourth.name,
                            num5: fifth.name
                        });
                    }
                });
            });
        
        io.to(game.pin).emit('nextQuestionPlayer');
    });
    
    //Cuando el anfitrión inicia el juego
    socket.on('startGame', () => {
        var game = games.getGame(socket.id);//Obtener el juego basado en el socket.id
        game.gameLive = true;
        socket.emit('gameStarted', game.hostId);//Notificar al jugador y al anfitrión que el juego ha iniciado
    });
    
    //Transmitir los nombres de los juegos a los usuarios
    socket.on('requestDbNames', function(){
        
        MongoClient.connect(url, function(err, db){
            if (err) throw err;
    
            var dbo = db.db('kahootDB');
            dbo.collection("kahootGames").find().toArray(function(err, res) {
                if (err) throw err;
                socket.emit('gameNamesData', res);
                db.close();
            });
        });
        
         
    });
    
    
    socket.on('newQuiz', function(data){
        MongoClient.connect(url, function(err, db){
            if (err) throw err;
            var dbo = db.db('kahootDB');
            dbo.collection('kahootGames').find({}).toArray(function(err, result){
                if(err) throw err;
                var num = Object.keys(result).length;
                if(num == 0){
                	data.id = 1
                	num = 1
                }else{
                	data.id = result[num -1 ].id + 1;
                }
                var game = data;
                dbo.collection("kahootGames").insertOne(game, function(err, res) {
                    if (err) throw err;
                    db.close();
                });
                db.close();
                socket.emit('startGameFromCreator', num);
            });
            
        });
        
        
    });
    
});
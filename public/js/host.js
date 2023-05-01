var socket = io();
var params = jQuery.deparam(window.location.search);

//Cuando el host conecta al servidor
socket.on('connect', function() {

    document.getElementById('players').value = "";
    
    //Decirle al server que es la conexión host
    socket.emit('host-join', params);
});

socket.on('showGamePin', function(data){
   document.getElementById('gamePinText').innerHTML = data.pin;
});

//Agrega el nombre del jugador a la pantalla y lo añade a la lista
socket.on('updatePlayerLobby', function(data){
    
    document.getElementById('players').value = "";
    
    for(var i = 0; i < data.length; i++){
        document.getElementById('players').value += data[i].name + "\n";
    }
    
});

//Decirle al server que empiece el juego
function startGame(){
    socket.emit('startGame');
}
function endGame(){
    window.location.href = "/";
}

//Cuando el servidor empieza el juego
socket.on('gameStarted', function(id){
    console.log('Juego Comenzado!');
    window.location.href="/host/game/" + "?id=" + id;
});

//Redirecciona al usuario a la pantalla de 'unirse a juego'
socket.on('noGameFound', function(){
   window.location.href = '../../';
});
var socket = io();

//Cuando el jugador se conecta al servidor
socket.on('connect', function() {
    
    var params = jQuery.deparam(window.location.search); 
    //Consigue información de la URL
    
    //Le dice al servidor que es una conexión de jugador
    socket.emit('player-join', params);
});

//Regresa al jugador a la pantalla de unirse a un juego si el PIN no existe
socket.on('noGameFound', function(){
    window.location.href = '../';
});

//Si el host se desconecta, el jugador es regresado a la pantalla de inicio
socket.on('hostDisconnect', function(){
    window.location.href = '../';
});

//Cuando el host inicia el juego, la pantalla del jugador cambia
socket.on('gameStartedPlayer', function(){
    window.location.href="/player/game/" + "?id=" + socket.id;
});



'use strict';

// ==========================================================================
// Global variables
// ==========================================================================
var peerConnection; // WebRTC PeerConnection
var dataChannel; // WebRTC DataChannel
var room; // Room name: Caller and Callee have to join the same 'room'.
var socket; // Socket.io connection to the Web server for signaling.

// ==========================================================================
// 1. Make call
// ==========================================================================

// --------------------------------------------------------------------------
// Function call, when call button is clicked.
async function call() {
  // Enable local video stream from camera or screen sharing
  var localStream = await enable_camera();

  // Create Socket.io connection for signaling and add handlers
  // Then start signaling to join a room
  socket = create_signaling_connection();
  add_signaling_handlers(socket);
  call_room(socket);

  // Create peerConneciton and add handlers
  peerConnection = create_peerconnection(localStream);
  add_peerconnection_handlers(peerConnection);
}

// --------------------------------------------------------------------------
// Enable camera
// use getUserMedia or displayMedia (share screen). 
// Then show it on localVideo.
async function enable_camera() {

  // define constraints: set video to true, audio to false
  const constraints = {video: true, audio: false};
  
  // uncomment the following log message
  console.log('Getting user media with constraints', constraints);

  // use getUserMedia to get a local media stream from the camera.
  //               If this fails, use getDisplayMedia to get a screen sharing stream.

  var stream;
  
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got camera:', stream);
    } catch(error) {
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('Got screen:', stream);
    }

  document.getElementById('localVideo').srcObject = stream;
  return stream;
}

// ==========================================================================
// 2. Signaling connection: create Socket.io connection and connect handlers
//  REF : https://socket.io/docs/v2/
// ==========================================================================

// --------------------------------------------------------------------------
// Create a Socket.io connection with the Web server for signaling
function create_signaling_connection() {
  // create a socket by simply calling the io() function
  //               provided by the socket.io library (included in index.html).
  var socket = io();
  return socket;
}


function add_signaling_handlers(socket) {
  // Event handlers for joining a room. Just print console messages
  // --------------------------------------------------------------
  // use the 'socket.on' method to create handlers for the 
  //               messages 'created', 'joined', 'full'.
  //               For all three messages, simply write a console log.
  socket.on('created', room => {
    console.log("Created: " + room);
  });

  socket.on('joined', room => {
	
    console.log("Joined: " + room);
    handle_joined(room);
  });

  socket.on('full', room => {
    console.log("full: " + room);
  });


  // Event handlers for call establishment signaling messages
  // --------------------------------------------------------
  // use the 'socket.on' method to create signaling message handlers:
  // new_peer --> handle_new_peer
  socket.on('new_peer', room => {
    handle_new_peer(room);
    console.log("new_peer: " + room);
  });

  // invite --> handle_invite
  socket.on('invite', sdp_off => {
    handle_invite(sdp_off);
    console.log("invite: " + sdp_off);
  });

  // ok --> handle_ok
  socket.on('ok', sdp_ans => {
    handle_ok(sdp_ans);
    console.log("ok: " + sdp_ans);
  });

  // ice_candidate --> handle_remote_icecandidate
  socket.on('ice_candidate', candidate => {
    handle_remote_icecandidate(candidate);
    console.log("ice_candidate: " + candidate);
  });

  // bye --> hangUp
  socket.on('bye',() => {
    hangUp();
  });
}


// --------------------------------------------------------------------------
// Prompt user for room name then send a "join" event to server
function call_room(socket) {
  room = prompt('Enter room name:');
  if (room != '') {
      console.log('Joining room: ' + room);
      // send a join message to the server with room as argument.
      socket.emit('join', room);
  }
}

// ==========================================================================
// 3. PeerConnection creation
// ==========================================================================

// --------------------------------------------------------------------------
// Create a new RTCPeerConnection and connect local stream
function create_peerconnection(localStream) {
  const pcConfiguration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]}

  // create a new RTCPeerConnection with this configuration
  var pc = new RTCPeerConnection([pcConfiguration]);

  // add all tracks of the local stream to the peerConnection
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  return pc;
}

// --------------------------------------------------------------------------
// Set the event handlers on the peerConnection. 
// This function is called by the call function all on top of the file.
function add_peerconnection_handlers(peerConnection) {

  // add event handlers on the peerConnection
  
  //https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate
  // onicecandidate -> handle_local_icecandidate
  peerConnection.onicecandidate = function(event){
    handle_local_icecandidate(event);
  }

  // ontrack -> handle_remote_track
  peerConnection.ontrack = function(event){
    handle_remote_track(event);
  }

  // ondatachannel -> handle_remote_datachannel
  peerConnection.ondatachannel = function(event){
    handle_remote_datachannel(event);
  }

}

// ==========================================================================
// 4. Signaling for peerConnection negotiation
// ==========================================================================

// --------------------------------------------------------------------------
// Handle new peer: another peer has joined the room. I am the Caller.
// Create SDP offer and send it to peer via the server.
//https://webrtc.org/getting-started/peer-connections
async function handle_new_peer(room){
  console.log('Peer has joined room: ' + room + '. I am the Caller.');
  create_datachannel(peerConnection); // MUST BE CALLED BEFORE createOffer

  // use createOffer (with await) generate an SDP offer for peerConnection
  const offer = await peerConnection.createOffer();

  // use setLocalDescription (with await) to add the offer to peerConnection
  await peerConnection.setLocalDescription(offer);

  // send an 'invite' message with the offer to the peer.
  //socket.emit('invite', offer); 
}

// --------------------------------------------------------------------------
// Caller has sent Invite with SDP offer. I am the Callee.
// Set remote description and send back an Ok answer.
//https://webrtc.org/getting-started/peer-connections
async function handle_invite(offer) {
  console.log('Received Invite offer from Caller: ', offer);
  // use setRemoteDescription (with await) to add the offer SDP to peerConnection 
  await peerConnection.setRemoteDescription(offer);
  // use createAnswer (with await) to generate an answer SDP
  var answer = await peerConnection.createAnswer();
  //IL Y AVAIT UNE ERRER
  // use setLocalDescription (with await) to add the answer SDP to peerConnection
  await peerConnection.setLocalDescription(answer);
  // send an 'ok' message with the answer to the peer.
  //socket.emit('ok', answer); 
}

// --------------------------------------------------------------------------
// Callee has sent Ok answer. I am the Caller.
// Set remote description.
async function handle_ok(answer) {
  console.log('Received OK answer from Callee: ', answer);
  // use setRemoteDescription (with await) to add the answer SDP 
  //               the peerConnection
  await peerConnection.setRemoteDescription(answer);
}

//NEW
async function handle_joined(data) {
    console.log("joined : " + data);
    var offer = peerConnection.createOffer();
    peerConnection.setLocalDescription(offer);
}
//FIN NEW

// ==========================================================================
// 5. ICE negotiation and remote stream handling
// ==========================================================================

// --------------------------------------------------------------------------
// A local ICE candidate has been created by the peerConnection.
// Send it to the peer via the server.
async function handle_local_icecandidate(event) {
  console.log('Received local ICE caandidate: ', event);
  if (!event.candidate) {
  	var offer = peerConnection.localDescription;
  	socket.emit('invite', offer);
  }
}

// --------------------------------------------------------------------------
// The peer has sent a remote ICE candidate. Add it to the PeerConnection.
async function handle_remote_icecandidate(candidate) {
  console.log('Received remote ICE candidate: ', candidate);
  // add the received remote ICE candidate to the peerConnection 
  await peerConnection.addIceCandidate(candidate); 
  //AJOUT DU AWAIT
}

// ==========================================================================
// 6. Function to handle remote video stream
// ==========================================================================

// --------------------------------------------------------------------------
// A remote track event has been received on the peerConnection.
// Show the remote track video on the web page.
function handle_remote_track(event) {
  console.log('Received remote track: ', event);
  // get the first stream of the event and show it in remoteVideo
  document.getElementById('remoteVideo').srcObject = event.streams[0];
}


// ==========================================================================
// 8. Functions to end call
// ==========================================================================

// --------------------------------------------------------------------------
// HangUp: Send a bye message to peer and close all connections and streams.
function hangUp() {
  // Write a console log
  console.log('End connections');

  // send a bye message with the room name to the server
  socket.emit('bye', room);

  // Switch off the local stream by stopping all tracks of the local stream
  var localVideo = document.getElementById('localVideo')
  var remoteVideo = document.getElementById('remoteVideo')

  // remove the tracks from localVideo and remoteVideo
  localVideo.srcObject.getTracks().forEach(function(track) {
    track.stop();
  });
  localVideo.srcObject = null; 

  remoteVideo.srcObject.getTracks().forEach(function(track) {
    track.stop();
  });
  remoteVideo.srcObject = null; 
  
  // set localVideo and remoteVideo source objects to null
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  
  // close the peerConnection and set it to null
  peerConnection.close();
  peerConnection = null;
  
  // close the dataChannel and set it to null
  dataChannel.close();
  dataChannel = null;

  document.getElementById('dataChannelOutput').value += '*** Channel is closed ***\n';
}

// --------------------------------------------------------------------------
// Clean-up: hang up before unloading the window
window.onbeforeunload = function(e) {
  hangUp();
}

const TIME_TO_HOST_CANDIDATES = 3000;  // NOTE(mroberts): Too long.

class ConnectionClient {
  constructor(options = {}) {
    this.options = {
      beforeAnswer: null,
      stereo: false,
      timeToHostCandidates: TIME_TO_HOST_CANDIDATES,
      ...options
    };
    this.peerConnection = new RTCPeerConnection({
      sdpSemantics: 'unified-plan'
    });
  }

  addEventListener(event, cb) {
    if (event === 'close') {
      // NOTE(mroberts): This is a hack so that we can get a callback when the
      // RTCPeerConnection is closed. In the future, we can subscribe to
      // "connectionstatechange" events.
      this.peerConnection.close = function () {
        cb();
        return RTCPeerConnection.prototype.close.apply(this, arguments);
      }
      return;
    }
    this.peerConnection.addEventListener(event, cb);
  }

  async applyAnswer(remotePeerConnection) {
    try {
      const { beforeAnswer, stereo } = this.options;
      await this.peerConnection.setRemoteDescription(remotePeerConnection.localDescription);

      if (beforeAnswer) {
        await beforeAnswer(this.peerConnection);
      }

      const originalAnswer = await this.peerConnection.createAnswer();

      const updatedAnswer = new RTCSessionDescription({
        type: 'answer',
        sdp: stereo ? this.enableStereoOpus(originalAnswer.sdp) : originalAnswer.sdp
      });

      await this.peerConnection.setLocalDescription(updatedAnswer);

      return this.peerConnection.localDescription;
    } catch (err) {
      this.peerConnection.close();
      throw error;
    }
  }

  enableStereoOpus(sdp) {
    return sdp.replace(/a=fmtp:111/, 'a=fmtp:111 stereo=1\r\na=fmtp:111');
  }
}
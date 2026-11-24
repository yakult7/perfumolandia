package com.perfumolandia.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpParameters;
import org.webrtc.RtpReceiver;
import org.webrtc.RtpTransceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Transmissão da tela do celular (Android).
 * O WebView não consegue capturar a tela, então este plugin captura com MediaProjection
 * e envia por uma conexão WebRTC nativa separada para cada amigo que clicar em "Assistir".
 * A sinalização (SDP/ICE) passa pelo JavaScript, que usa o mesmo canal do Supabase.
 */
@CapacitorPlugin(name = "ScreenShare")
public class ScreenSharePlugin extends Plugin {
    private EglBase egl;
    private PeerConnectionFactory factory;
    private ScreenCapturerAndroid capturer;
    private SurfaceTextureHelper helper;
    private VideoSource source;
    private VideoTrack track;
    private final Map<String, PeerConnection> peers = new HashMap<>();
    private List<PeerConnection.IceServer> iceServers = new ArrayList<>();
    private final String streamId = "native-" + UUID.randomUUID().toString().substring(0, 8);
    private int width;
    private int height;
    private int fps = 30;
    private int maxKbps = 8000;
    private boolean stopping = false;

    @PluginMethod
    public void start(PluginCall call) {
        if (track != null) {
            call.resolve(info());
            return;
        }
        iceServers = parseIce(call.getArray("iceServers"));
        fps = call.getInt("fps", 30);
        maxKbps = call.getInt("maxKbps", 8000);
        MediaProjectionManager mpm = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "onProjection");
    }

    @ActivityCallback
    private void onProjection(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Permissão para gravar a tela negada.");
            return;
        }
        final Intent data = result.getData();
        // Android 14+: o serviço em primeiro plano precisa estar ativo antes de usar a projeção
        ScreenShareService.start(getContext());
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                startCapture(data);
                call.resolve(info());
            } catch (Exception e) {
                ScreenShareService.stop(getContext());
                call.reject("Falha ao capturar a tela: " + e.getMessage());
            }
        }, 350);
    }

    private JSObject info() {
        JSObject r = new JSObject();
        r.put("streamId", streamId);
        r.put("width", width);
        r.put("height", height);
        return r;
    }

    private void startCapture(Intent data) {
        if (factory == null) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(getContext().getApplicationContext()).createInitializationOptions());
            egl = EglBase.create();
            factory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
                .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
                .createPeerConnectionFactory();
        }
        DisplayMetrics m = getContext().getResources().getDisplayMetrics();
        int w = m.widthPixels;
        int h = m.heightPixels;
        // lado menor no máximo 1080 px (resolução nativa da maioria dos celulares)
        float k = Math.min(1f, 1080f / Math.min(w, h));
        width = Math.round(w * k) & ~1;
        height = Math.round(h * k) & ~1;
        stopping = false;
        capturer = new ScreenCapturerAndroid(data, new MediaProjection.Callback() {
            @Override
            public void onStop() {
                if (stopping) return;
                getActivity().runOnUiThread(() -> {
                    stopAll();
                    notifyListeners("stopped", new JSObject());
                });
            }
        });
        helper = SurfaceTextureHelper.create("PerfumoScreen", egl.getEglBaseContext());
        source = factory.createVideoSource(true);
        capturer.initialize(helper, getContext(), source.getCapturerObserver());
        capturer.startCapture(width, height, fps);
        track = factory.createVideoTrack("screen0", source);
    }

    @PluginMethod
    public void offer(PluginCall call) {
        final String id = call.getString("peerId");
        if (track == null || id == null) {
            call.reject("Transmissão não iniciada.");
            return;
        }
        closePeerInternal(id);
        PeerConnection.RTCConfiguration cfg = new PeerConnection.RTCConfiguration(iceServers);
        cfg.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        cfg.bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE;
        final PeerConnection pc = factory.createPeerConnection(cfg, new PcObserver(id));
        if (pc == null) {
            call.reject("Não foi possível criar a conexão.");
            return;
        }
        RtpTransceiver t = pc.addTransceiver(track,
            new RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY, Collections.singletonList(streamId)));
        RtpParameters p = t.getSender().getParameters();
        for (RtpParameters.Encoding e : p.encodings) {
            e.maxBitrateBps = maxKbps * 1000;
            e.maxFramerate = fps;
        }
        t.getSender().setParameters(p);
        peers.put(id, pc);
        pc.createOffer(new SdpAdapter() {
            @Override
            public void onCreateSuccess(final SessionDescription sd) {
                pc.setLocalDescription(new SdpAdapter() {
                    @Override
                    public void onSetSuccess() {
                        JSObject r = new JSObject();
                        r.put("type", "offer");
                        r.put("sdp", sd.description);
                        call.resolve(r);
                    }

                    @Override
                    public void onSetFailure(String e) {
                        call.reject(e);
                    }
                }, sd);
            }

            @Override
            public void onCreateFailure(String e) {
                call.reject(e);
            }
        }, new MediaConstraints());
    }

    @PluginMethod
    public void answer(PluginCall call) {
        PeerConnection pc = peers.get(call.getString("peerId"));
        if (pc == null) {
            call.reject("Conexão não encontrada.");
            return;
        }
        pc.setRemoteDescription(new SdpAdapter() {
            @Override
            public void onSetSuccess() {
                call.resolve();
            }

            @Override
            public void onSetFailure(String e) {
                call.reject(e);
            }
        }, new SessionDescription(SessionDescription.Type.ANSWER, call.getString("sdp")));
    }

    @PluginMethod
    public void addIce(PluginCall call) {
        PeerConnection pc = peers.get(call.getString("peerId"));
        JSObject c = call.getObject("candidate");
        if (pc != null && c != null) {
            pc.addIceCandidate(new IceCandidate(c.getString("sdpMid"), c.optInt("sdpMLineIndex", 0), c.getString("candidate")));
        }
        call.resolve();
    }

    @PluginMethod
    public void closePeer(PluginCall call) {
        closePeerInternal(call.getString("peerId"));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        call.resolve();
    }

    private void closePeerInternal(String id) {
        PeerConnection pc = peers.remove(id);
        if (pc != null) pc.dispose();
    }

    private void stopAll() {
        stopping = true;
        for (PeerConnection pc : peers.values()) pc.dispose();
        peers.clear();
        if (capturer != null) {
            try { capturer.stopCapture(); } catch (Exception ignored) { }
            capturer.dispose();
            capturer = null;
        }
        if (track != null) { track.dispose(); track = null; }
        if (source != null) { source.dispose(); source = null; }
        if (helper != null) { helper.dispose(); helper = null; }
        ScreenShareService.stop(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
        super.handleOnDestroy();
    }

    private static List<PeerConnection.IceServer> parseIce(JSArray arr) {
        List<PeerConnection.IceServer> out = new ArrayList<>();
        if (arr == null) return out;
        try {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject s = arr.getJSONObject(i);
                List<String> urls = new ArrayList<>();
                Object u = s.get("urls");
                if (u instanceof JSONArray) {
                    JSONArray ua = (JSONArray) u;
                    for (int j = 0; j < ua.length(); j++) urls.add(ua.getString(j));
                } else {
                    urls.add(String.valueOf(u));
                }
                PeerConnection.IceServer.Builder b = PeerConnection.IceServer.builder(urls);
                if (s.has("username")) b.setUsername(s.getString("username"));
                if (s.has("credential")) b.setPassword(s.getString("credential"));
                out.add(b.createIceServer());
            }
        } catch (Exception ignored) { }
        return out;
    }

    private class PcObserver implements PeerConnection.Observer {
        private final String id;

        PcObserver(String id) { this.id = id; }

        @Override
        public void onIceCandidate(IceCandidate c) {
            JSObject cand = new JSObject();
            cand.put("candidate", c.sdp);
            cand.put("sdpMid", c.sdpMid);
            cand.put("sdpMLineIndex", c.sdpMLineIndex);
            JSObject ev = new JSObject();
            ev.put("peerId", id);
            ev.put("candidate", cand);
            notifyListeners("ice", ev);
        }

        @Override public void onSignalingChange(PeerConnection.SignalingState s) { }
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState s) {
            if (s == PeerConnection.IceConnectionState.FAILED) {
                PeerConnection pc = peers.get(id);
                if (pc != null) pc.restartIce();
            }
        }
        @Override public void onIceConnectionReceivingChange(boolean b) { }
        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState s) { }
        @Override public void onIceCandidatesRemoved(IceCandidate[] c) { }
        @Override public void onAddStream(MediaStream s) { }
        @Override public void onRemoveStream(MediaStream s) { }
        @Override public void onDataChannel(DataChannel d) { }
        @Override public void onRenegotiationNeeded() { }
        @Override public void onAddTrack(RtpReceiver r, MediaStream[] s) { }
    }

    private abstract static class SdpAdapter implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sd) { }
        @Override public void onSetSuccess() { }
        @Override public void onCreateFailure(String e) { }
        @Override public void onSetFailure(String e) { }
    }
}

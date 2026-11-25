package com.perfumolandia.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Recebe o aviso de ligação do servidor (Firebase) e faz o celular tocar como uma chamada,
 * mesmo com o app fechado. Toque repete até a pessoa abrir ou arrastar a notificação (no máximo 45 s).
 */
public class CallMessagingService extends FirebaseMessagingService {
    static final String CH_CALL = "chamadas_v1";
    static final String CH_MISSED = "perdidas_v1";
    /** o app está aberto na tela: o próprio app já toca */
    static volatile boolean foreground = false;

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("push", MODE_PRIVATE).edit().putString("token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        String type = d.get("type");
        String dmId = d.get("dmId");
        if (type == null || dmId == null) return;
        String name = d.get("name") != null ? d.get("name") : "Alguém";
        String group = d.get("group");
        boolean isGroup = group != null && !group.isEmpty();
        Context ctx = getApplicationContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannels(nm);
        int id = dmId.hashCode();

        if ("cancel".equals(type)) {
            nm.cancel(id);
            if (foreground) return;
            Notification n = new NotificationCompat.Builder(ctx, CH_MISSED)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Chamada perdida")
                .setContentText(isGroup ? name + " ligou em " + group : name + " te ligou")
                .setContentIntent(openApp(ctx, dmId))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
                .build();
            nm.notify(id, n);
            return;
        }
        if (!"call".equals(type) || foreground) return;

        PendingIntent open = openApp(ctx, dmId);
        Notification n = new NotificationCompat.Builder(ctx, CH_CALL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(isGroup ? name + " está ligando em " + group : name + " está te ligando")
            .setContentText("Toque para atender na Perfumolandia")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .setOngoing(false)
            .setAutoCancel(true)
            .setTimeoutAfter(45000)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), android.media.AudioManager.STREAM_RING)
            .setVibrate(new long[] { 0, 800, 600, 800, 600, 800 })
            .addAction(0, "Atender", open)
            .build();
        n.flags |= Notification.FLAG_INSISTENT; // toque repete até mexer na notificação
        nm.notify(id, n);
    }

    static PendingIntent openApp(Context ctx, String dmId) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("callDm", dmId);
        return PendingIntent.getActivity(ctx, dmId.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void ensureChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CH_CALL) == null) {
            NotificationChannel c = new NotificationChannel(CH_CALL, "Ligações", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Toca quando alguém te liga");
            Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            c.setSound(ring, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            c.enableVibration(true);
            c.setVibrationPattern(new long[] { 0, 800, 600, 800, 600, 800 });
            c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            c.setBypassDnd(false);
            nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(CH_MISSED) == null) {
            NotificationChannel c = new NotificationChannel(CH_MISSED, "Chamadas perdidas", NotificationManager.IMPORTANCE_DEFAULT);
            nm.createNotificationChannel(c);
        }
    }
}

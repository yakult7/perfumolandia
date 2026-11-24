package com.perfumolandia.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/** Serviço em primeiro plano exigido pelo Android para gravar a tela (mostra a notificação "Transmitindo"). */
public class ScreenShareService extends Service {
    private static final String CHANNEL = "screen_share";

    static void start(Context c) {
        Intent i = new Intent(c, ScreenShareService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, ScreenShareService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Transmissão de tela", NotificationManager.IMPORTANCE_LOW));
        }
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Perfumolandia")
            .setContentText("Transmitindo sua tela")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        else startForeground(1, n);
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

package com.barrantesco.syncengine;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Tarea periódica (cada 15 min, el mínimo de Android) que refresca contadores y avisos. */
public final class SyncJobService extends JobService {
    private static final int JOB_ID = 4201;
    private static final long INTERVAL_MS = 15 * 60 * 1000L;

    /** Programa la consulta periódica; es idempotente. */
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null || scheduler.getPendingJob(JOB_ID) != null) {
            return;
        }
        scheduler.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(INTERVAL_MS)
                .setPersisted(true)
                .build());
    }

    /** Cancela la consulta periódica (al cerrar sesión). */
    static void cancel(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) {
            scheduler.cancel(JOB_ID);
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            boolean ok = SyncRefresher.refresh(getApplicationContext());
            jobFinished(params, !ok);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}

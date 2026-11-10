package com.medcodeai.api.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * Port of app.py's module-level _write_lock: every write endpoint runs under
 * one process-wide lock (Flask relied on gunicorn --workers 1 for the same
 * single-writer guarantee). Reads never take it.
 */
@Component
public class WriteGate {

    private final ReentrantLock lock = new ReentrantLock();

    public <T> T locked(Supplier<T> work) {
        lock.lock();
        try {
            return work.get();
        } finally {
            lock.unlock();
        }
    }
}

package auth

import (
	"sync"
	"time"
)

// limiter applies a per-key progressive delay: base, 2*base, 4*base ... up to max.
type limiter struct {
	mu        sync.Mutex
	now       func() time.Time
	base, max time.Duration
	m         map[string]*entry
}

type entry struct {
	fails int
	until time.Time
}

func newLimiter(now func() time.Time) *limiter {
	return &limiter{now: now, base: time.Second, max: 5 * time.Minute, m: map[string]*entry{}}
}

// wait returns how long key must still wait before another attempt.
func (l *limiter) wait(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e := l.m[key]; e != nil {
		if d := e.until.Sub(l.now()); d > 0 {
			return d
		}
	}
	return 0
}

func (l *limiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e := l.m[key]
	if e == nil {
		e = &entry{}
		l.m[key] = e
	}
	e.fails++
	d := l.max
	if e.fails <= 20 {
		if x := l.base << (e.fails - 1); x < l.max {
			d = x
		}
	}
	e.until = l.now().Add(d)
}

func (l *limiter) ok(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.m, key)
}

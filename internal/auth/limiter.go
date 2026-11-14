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
	busy  bool
	until time.Time
}

func newLimiter(now func() time.Time) *limiter {
	return &limiter{now: now, base: time.Second, max: 5 * time.Minute, m: map[string]*entry{}}
}

// begin atomically checks the delay and reserves the key: it returns false
// (with the remaining wait) if the key is delayed or has an attempt in flight.
// Every successful begin must be completed with fail, ok or release.
func (l *limiter) begin(key string) (time.Duration, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	for k, e := range l.m {
		if !e.busy && now.After(e.until.Add(l.max)) {
			delete(l.m, k)
		}
	}
	e := l.m[key]
	if e == nil {
		e = &entry{}
		l.m[key] = e
	}
	if e.busy {
		return l.base, false
	}
	if d := e.until.Sub(now); d > 0 {
		return d, false
	}
	e.busy = true
	return 0, true
}

// release ends a reserved attempt without counting it.
func (l *limiter) release(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e := l.m[key]; e != nil {
		e.busy = false
	}
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
	e.busy = false
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

package plugins

import (
	"encoding/json"
	"testing"
)

func TestManifestValidation(t *testing.T) {
	tests := []struct {
		name    string
		m       Manifest
		wantErr bool
	}{
		{
			name: "valid minimal",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
			},
			wantErr: false,
		},
		{
			name: "invalid id too short",
			m: Manifest{
				ID:          "a",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid id uppercase",
			m: Manifest{
				ID:          "TestPlugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid id with underscore",
			m: Manifest{
				ID:          "test_plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid version",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid entry with slash",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "sub/index.js",
			},
			wantErr: true,
		},
		{
			name: "invalid entry .js",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       ".js",
			},
			wantErr: true,
		},
		{
			name: "invalid permission",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"invalid"},
			},
			wantErr: true,
		},
		{
			name: "valid permission screen:read",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"screen:read"},
			},
			wantErr: false,
		},
		{
			name: "valid permission net:example.com",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"net:example.com"},
			},
			wantErr: false,
		},
		{
			name: "invalid permission net:ip",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"net:192.168.1.1"},
			},
			wantErr: true,
		},
		{
			name: "invalid permission net:port",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"net:example.com:8080"},
			},
			wantErr: true,
		},
		{
			name: "duplicate permissions",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Permissions: []string{"screen:read", "screen:read"},
			},
			wantErr: true,
		},
		{
			name: "valid commands",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Commands: []Command{
					{ID: "cmd1", Title: "Command 1"},
					{ID: "cmd2", Title: "Command 2"},
				},
			},
			wantErr: false,
		},
		{
			name: "invalid command missing title",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Commands: []Command{
					{ID: "cmd1"},
				},
			},
			wantErr: true,
		},
		{
			name: "duplicate command ids",
			m: Manifest{
				ID:          "test-plugin",
				Name:        "Test",
				Version:     "1.0.0",
				Author:      "Author",
				Description: "Desc",
				Entry:       "index.js",
				Commands: []Command{
					{ID: "cmd", Title: "Cmd1"},
					{ID: "cmd", Title: "Cmd2"},
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.m.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("got err %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestParseManifestRejectsUnknownFields(t *testing.T) {
	raw := []byte(`{
		"id": "test",
		"name": "Test",
		"version": "1.0.0",
		"author": "Author",
		"description": "Desc",
		"entry": "index.js",
		"unknown_field": "value"
	}`)
	_, err := ParseManifest(raw)
	if err == nil {
		t.Error("should reject unknown fields")
	}
}

func TestPermEqual(t *testing.T) {
	tests := []struct {
		a, b []string
		want bool
	}{
		{[]string{}, []string{}, true},
		{[]string{"screen:read"}, []string{"screen:read"}, true},
		{[]string{"screen:read", "ai"}, []string{"ai", "screen:read"}, true},
		{[]string{"screen:read"}, []string{"ai"}, false},
		{[]string{"screen:read"}, []string{"screen:read", "ai"}, false},
	}

	for _, tt := range tests {
		got := PermEqual(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("PermEqual(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestManifestMarshalRoundtrip(t *testing.T) {
	m := Manifest{
		ID:          "test-plugin",
		Name:        "Test",
		Version:     "1.0.0",
		Author:      "Author",
		Description: "Desc",
		Entry:       "index.js",
		Permissions: []string{"screen:read", "ai"},
		Commands: []Command{
			{ID: "cmd1", Title: "Command 1"},
		},
	}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	m2, err := ParseManifest(b)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m2.ID != m.ID || m2.Name != m.Name || m2.Version != m.Version {
		t.Errorf("roundtrip failed: %+v != %+v", m, m2)
	}
}

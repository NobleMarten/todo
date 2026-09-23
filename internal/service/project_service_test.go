package service

import (
	"context"
	"errors"
	"slices"
	"testing"
	"todo/internal/model"
	"todo/internal/storage"
)

func TestProjectCreate(t *testing.T) {
	ctx := context.Background()
	s := NewProjectService(&storage.FakeRepo{}, msk)

	p, err := s.Create(ctx, "  Go  ", "")
	if err != nil || p.Name != "Go" || p.Color != defaultProjectColor {
		t.Fatalf("got %+v, %v", p, err)
	}

	tests := []struct {
		name, in, color string
		err             error
	}{
		{"empty name", " ", "", model.ErrEmptyName},
		{"bad color", "x", "blue", model.ErrInvalidColor},
		{"short color", "x", "#FFF", model.ErrInvalidColor},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := s.Create(ctx, tt.in, tt.color); !errors.Is(err, tt.err) {
				t.Fatalf("err = %v, want %v", err, tt.err)
			}
		})
	}
}

func TestProjectPatchDeleteReorder(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	s := NewProjectService(repo, msk)
	a, _ := s.Create(ctx, "a", "#111111")
	b, _ := s.Create(ctx, "b", "#222222")

	got, err := s.Patch(ctx, a.ID, storage.ProjectPatch{Name: ptr(" aa "), Color: ptr("#abcdef")})
	if err != nil || got.Name != "aa" || got.Color != "#abcdef" {
		t.Fatalf("patch: %+v, %v", got, err)
	}
	for _, tc := range []struct {
		name  string
		id    int
		patch storage.ProjectPatch
		err   error
	}{
		{"invalid id", 0, storage.ProjectPatch{Name: ptr("x")}, model.ErrInvalidID},
		{"nothing", a.ID, storage.ProjectPatch{}, model.ErrNothingToUpdate},
		{"empty name", a.ID, storage.ProjectPatch{Name: ptr("")}, model.ErrEmptyName},
		{"bad color", a.ID, storage.ProjectPatch{Color: ptr("red")}, model.ErrInvalidColor},
		{"not found", 999, storage.ProjectPatch{Archived: ptr(true)}, model.ErrProjectNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := s.Patch(ctx, tc.id, tc.patch); !errors.Is(err, tc.err) {
				t.Fatalf("err = %v, want %v", err, tc.err)
			}
		})
	}

	if err := s.Reorder(ctx, []int{b.ID, a.ID, b.ID}); err != nil {
		t.Fatal(err)
	}
	list, _ := s.List(ctx, false, &d0)
	if ids := []int{list[0].ID, list[1].ID}; !slices.Equal(ids, []int{b.ID, a.ID}) {
		t.Fatalf("order = %v", ids)
	}

	// архивный список виден только с archived=true
	if _, err := s.Patch(ctx, b.ID, storage.ProjectPatch{Archived: ptr(true)}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.List(ctx, false, nil); len(list) != 1 {
		t.Fatalf("active = %d, want 1", len(list))
	}
	if list, _ := s.List(ctx, true, nil); len(list) != 2 {
		t.Fatalf("all = %d, want 2", len(list))
	}

	if err := s.Delete(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, a.ID); !errors.Is(err, model.ErrProjectNotFound) {
		t.Fatalf("second delete: %v", err)
	}
	if err := s.Delete(ctx, 0); !errors.Is(err, model.ErrInvalidID) {
		t.Fatalf("id 0: %v", err)
	}
}

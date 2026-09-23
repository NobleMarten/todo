package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

const (
	defaultProjectColor = "#6AA6FF"
	maxProjectNameLen   = 60
)

var colorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type ProjectService struct {
	repo storage.ProjectRepo
	loc  *time.Location
}

func NewProjectService(repo storage.ProjectRepo, loc *time.Location) *ProjectService {
	return &ProjectService{repo: repo, loc: loc}
}

func validateName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", model.ErrEmptyName
	}
	if len([]rune(name)) > maxProjectNameLen {
		return "", model.ErrTitleTooLong
	}
	return name, nil
}

func validateColor(color string) error {
	if !colorRe.MatchString(color) {
		return fmt.Errorf("%w: %q", model.ErrInvalidColor, color)
	}
	return nil
}

// List отдаёт списки со счётчиками; today нужен, чтобы посчитать просроченные.
func (s *ProjectService) List(ctx context.Context, includeArchived bool, today *model.Date) ([]model.Project, error) {
	return s.repo.ListProjects(ctx, includeArchived, dateOrToday(today, s.loc))
}

func (s *ProjectService) Create(ctx context.Context, name, color string) (model.Project, error) {
	name, err := validateName(name)
	if err != nil {
		return model.Project{}, err
	}
	if color == "" {
		color = defaultProjectColor
	}
	if err := validateColor(color); err != nil {
		return model.Project{}, err
	}
	return s.repo.CreateProject(ctx, name, color)
}

func (s *ProjectService) Patch(ctx context.Context, id int, p storage.ProjectPatch) (model.Project, error) {
	if !validID(id) {
		return model.Project{}, model.ErrInvalidID
	}
	if p.Name == nil && p.Color == nil && p.Archived == nil {
		return model.Project{}, model.ErrNothingToUpdate
	}
	if p.Name != nil {
		name, err := validateName(*p.Name)
		if err != nil {
			return model.Project{}, err
		}
		p.Name = &name
	}
	if p.Color != nil {
		if err := validateColor(*p.Color); err != nil {
			return model.Project{}, err
		}
	}
	return s.repo.PatchProject(ctx, id, p)
}

func (s *ProjectService) Delete(ctx context.Context, id int) error {
	if !validID(id) {
		return model.ErrInvalidID
	}
	return s.repo.DeleteProject(ctx, id)
}

func (s *ProjectService) Reorder(ctx context.Context, ids []int) error {
	ids = uniqueIDs(ids)
	if len(ids) == 0 {
		return nil
	}
	return s.repo.ReorderProjects(ctx, ids)
}

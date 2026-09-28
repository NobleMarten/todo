package transport

import (
	"net/http"
	"todo/internal/model"
	"todo/internal/storage"
)

type CreateProjectRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// PatchProjectRequest: все поля NOT NULL, поэтому null отвергается, а не очищает.
type PatchProjectRequest struct {
	Name     model.Opt[string] `json:"name"`
	Color    model.Opt[string] `json:"color"`
	Archived model.Opt[bool]   `json:"archived"`
}

type ReorderProjectsRequest struct {
	IDs []int `json:"ids"`
}

// ListProjects — GET /projects[?archived=true][&today=YYYY-MM-DD].
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request, userID int) {
	q := r.URL.Query()
	archived, err := queryBool(q, "archived")
	if err != nil {
		WriteError(w, err)
		return
	}
	today, err := queryDate(q, "today")
	if err != nil {
		WriteError(w, err)
		return
	}
	projects, err := h.projects.List(r.Context(), userID, archived != nil && *archived, today)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request, userID int) {
	var req CreateProjectRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	project, err := h.projects.Create(r.Context(), userID, req.Name, req.Color)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (h *Handler) PatchProject(w http.ResponseWriter, r *http.Request, userID int) {
	id, err := pathID(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	var req PatchProjectRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	var patch storage.ProjectPatch
	if patch.Name, err = notNull(req.Name, "name"); err != nil {
		WriteError(w, err)
		return
	}
	if patch.Color, err = notNull(req.Color, "color"); err != nil {
		WriteError(w, err)
		return
	}
	if patch.Archived, err = notNull(req.Archived, "archived"); err != nil {
		WriteError(w, err)
		return
	}
	project, err := h.projects.Patch(r.Context(), userID, id, patch)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, project)
}

// DeleteProject — задачи списка уходят во «Входящие».
func (h *Handler) DeleteProject(w http.ResponseWriter, r *http.Request, userID int) {
	id, err := pathID(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	if err := h.projects.Delete(r.Context(), userID, id); err != nil {
		WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ReorderProjects(w http.ResponseWriter, r *http.Request, userID int) {
	var req ReorderProjectsRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	if err := h.projects.Reorder(r.Context(), userID, req.IDs); err != nil {
		WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

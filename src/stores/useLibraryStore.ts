import { create } from "zustand";
import type { VideoItem } from "../shared/types";

type View = "grid" | "list";

type LibraryState = {
  videos: VideoItem[];
  setVideos: (videos: VideoItem[]) => void;
  query: string;
  setQuery: (query: string) => void;
  sortOrder: string;
  setSortOrder: (sortOrder: string) => void;
  view: View;
  setView: (view: View) => void;
  saveDirectory: string;
  setSaveDirectory: (saveDirectory: string) => void;
  error: string;
  setError: (error: string) => void;
  notice: string;
  setNotice: (notice: string) => void;
  renaming: boolean;
  setRenaming: (renaming: boolean) => void;
  draftTitle: string;
  setDraftTitle: (draftTitle: string) => void;
  confirmDelete: boolean;
  setConfirmDelete: (confirmDelete: boolean) => void;
};

export const useLibraryStore = create<LibraryState>((set) => ({
  videos: [],
  setVideos: (videos) => set({ videos }),
  query: "",
  setQuery: (query) => set({ query }),
  sortOrder: "newest",
  setSortOrder: (sortOrder) => set({ sortOrder }),
  view: "grid",
  setView: (view) => set({ view }),
  saveDirectory: "",
  setSaveDirectory: (saveDirectory) => set({ saveDirectory }),
  error: "",
  setError: (error) => set({ error }),
  notice: "",
  setNotice: (notice) => set({ notice }),
  renaming: false,
  setRenaming: (renaming) => set({ renaming }),
  draftTitle: "",
  setDraftTitle: (draftTitle) => set({ draftTitle }),
  confirmDelete: false,
  setConfirmDelete: (confirmDelete) => set({ confirmDelete }),
}));

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ApiStatus } from '@/lib/types';
import { sessionEnded } from './auth-slice';

/**
 * Catalog search and filter state. Kept in Redux, not in the page component, so it survives
 * navigating to an API and back. The API data itself is cached by React Query, not here.
 * All filters combine; several tags match APIs with any of them.
 */
export interface CatalogState {
  q: string;
  tags: string[];
  status: ApiStatus | '';
  page: number;
  mine: boolean;
}

const initialState: CatalogState = { q: '', tags: [], status: '', page: 1, mine: false };

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload;
      state.page = 1;
    },
    /** Adds the tag if it is not selected, removes it if it is. */
    tagToggled(state, action: PayloadAction<string>) {
      const tag = action.payload;
      state.tags = state.tags.includes(tag)
        ? state.tags.filter((t) => t !== tag)
        : [...state.tags, tag];
      state.page = 1;
    },
    statusChanged(state, action: PayloadAction<ApiStatus | ''>) {
      state.status = action.payload;
      state.page = 1;
    },
    mineToggled(state) {
      state.mine = !state.mine;
      state.page = 1;
    },
    pageChanged(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    filtersCleared() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // Filters belong to the person who set them: start fresh after logout, so the next user
    // of this browser does not inherit them.
    builder.addCase(sessionEnded, () => initialState);
  },
});

export const {
  searchChanged,
  tagToggled,
  statusChanged,
  mineToggled,
  pageChanged,
  filtersCleared,
} = catalogSlice.actions;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Catalog search and filter state. Kept in Redux, not in the page component, so it survives
 * navigating to an API and back. The API data itself is cached by React Query, not here.
 */
export interface CatalogState {
  q: string;
  tag: string;
  page: number;
  mine: boolean;
}

const initialState: CatalogState = { q: '', tag: '', page: 1, mine: false };

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload;
      state.page = 1;
    },
    tagChanged(state, action: PayloadAction<string>) {
      state.tag = action.payload;
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
});

export const { searchChanged, tagChanged, mineToggled, pageChanged, filtersCleared } =
  catalogSlice.actions;

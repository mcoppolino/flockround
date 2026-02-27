const MIN_BOUND: f32 = 1.0e-6;
const MIN_CELL_SIZE: f32 = 1.0e-6;
const INVALID_INDEX: usize = usize::MAX;

pub struct NeighborGrid {
    cell_size: f32,
    width: f32,
    height: f32,
    cols: usize,
    rows: usize,
    particle_count: usize,
    head: Vec<usize>,
    next: Vec<usize>,
    cached_x: Vec<f32>,
    cached_y: Vec<f32>,
}

impl NeighborGrid {
    pub fn new(count: usize, width: f32, height: f32, cell_size: f32) -> Self {
        let mut grid = Self {
            cell_size: cell_size.max(MIN_CELL_SIZE),
            width: width.max(MIN_BOUND),
            height: height.max(MIN_BOUND),
            cols: 0,
            rows: 0,
            particle_count: 0,
            head: Vec::new(),
            next: Vec::new(),
            cached_x: Vec::new(),
            cached_y: Vec::new(),
        };

        grid.ensure_layout(count, grid.width, grid.height);
        grid
    }

    pub fn set_cell_size(&mut self, cell_size: f32) {
        self.cell_size = cell_size.max(MIN_CELL_SIZE);
        self.ensure_layout(self.particle_count, self.width, self.height);
    }

    pub fn rebuild(&mut self, positions_x: &[f32], positions_y: &[f32], width: f32, height: f32) {
        assert_eq!(positions_x.len(), positions_y.len());

        let width = width.max(MIN_BOUND);
        let height = height.max(MIN_BOUND);
        let count = positions_x.len();

        self.ensure_layout(count, width, height);
        self.head.fill(INVALID_INDEX);

        if count == 0 {
            return;
        }

        self.cached_x[..count].copy_from_slice(positions_x);
        self.cached_y[..count].copy_from_slice(positions_y);

        for i in 0..count {
            let cell = self.cell_index_for_position(positions_x[i], positions_y[i]);
            self.next[i] = self.head[cell];
            self.head[cell] = i;
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn for_each_neighbor_with_wrap<F>(
        &self,
        i: usize,
        radius: f32,
        wrap_x: bool,
        wrap_y: bool,
        mut callback: F,
    ) where
        F: FnMut(usize),
    {
        if i >= self.particle_count || self.particle_count == 0 {
            return;
        }

        let radius = radius.max(0.0);
        let radius_sq = radius * radius;
        let cell_radius = (radius / self.cell_size).ceil() as isize;

        let x = self.cached_x[i];
        let y = self.cached_y[i];
        let base_cell_x = self.cell_x(x);
        let base_cell_y = self.cell_y(y);

        let min_y = (base_cell_y - cell_radius).max(0);
        let max_y = (base_cell_y + cell_radius).min(self.rows as isize - 1);
        let min_x = (base_cell_x - cell_radius).max(0);
        let max_x = (base_cell_x + cell_radius).min(self.cols as isize - 1);

        if wrap_y {
            for y_offset in -cell_radius..=cell_radius {
                let cell_y = wrap_cell_index(base_cell_y + y_offset, self.rows);

                if wrap_x {
                    for x_offset in -cell_radius..=cell_radius {
                        let cell_x = wrap_cell_index(base_cell_x + x_offset, self.cols);
                        self.scan_cell(
                            cell_x,
                            cell_y,
                            i,
                            x,
                            y,
                            radius_sq,
                            wrap_x,
                            wrap_y,
                            &mut callback,
                        );
                    }
                } else {
                    for cell_x in min_x..=max_x {
                        self.scan_cell(
                            cell_x as usize,
                            cell_y,
                            i,
                            x,
                            y,
                            radius_sq,
                            wrap_x,
                            wrap_y,
                            &mut callback,
                        );
                    }
                }
            }
            return;
        }

        for cell_y in min_y..=max_y {
            if wrap_x {
                for x_offset in -cell_radius..=cell_radius {
                    let cell_x = wrap_cell_index(base_cell_x + x_offset, self.cols);
                    self.scan_cell(
                        cell_x,
                        cell_y as usize,
                        i,
                        x,
                        y,
                        radius_sq,
                        wrap_x,
                        wrap_y,
                        &mut callback,
                    );
                }
            } else {
                for cell_x in min_x..=max_x {
                    self.scan_cell(
                        cell_x as usize,
                        cell_y as usize,
                        i,
                        x,
                        y,
                        radius_sq,
                        wrap_x,
                        wrap_y,
                        &mut callback,
                    );
                }
            }
        }
    }

    fn ensure_layout(&mut self, count: usize, width: f32, height: f32) {
        self.width = width.max(MIN_BOUND);
        self.height = height.max(MIN_BOUND);
        self.particle_count = count;

        let cols = ((self.width / self.cell_size).ceil() as usize).max(1);
        let rows = ((self.height / self.cell_size).ceil() as usize).max(1);
        let grid_size = cols * rows;

        if cols != self.cols || rows != self.rows {
            self.cols = cols;
            self.rows = rows;
            self.head.resize(grid_size, INVALID_INDEX);
        }

        if self.next.len() != count {
            self.next.resize(count, INVALID_INDEX);
        }
        if self.cached_x.len() != count {
            self.cached_x.resize(count, 0.0);
            self.cached_y.resize(count, 0.0);
        }
    }

    fn cell_index_for_position(&self, x: f32, y: f32) -> usize {
        self.cell_y(y) as usize * self.cols + self.cell_x(x) as usize
    }

    fn cell_x(&self, x: f32) -> isize {
        ((x / self.cell_size).floor() as isize).clamp(0, self.cols as isize - 1)
    }

    fn cell_y(&self, y: f32) -> isize {
        ((y / self.cell_size).floor() as isize).clamp(0, self.rows as isize - 1)
    }

    #[allow(clippy::too_many_arguments)]
    fn scan_cell<F>(
        &self,
        cell_x: usize,
        cell_y: usize,
        i: usize,
        x: f32,
        y: f32,
        radius_sq: f32,
        wrap_x: bool,
        wrap_y: bool,
        callback: &mut F,
    ) where
        F: FnMut(usize),
    {
        let cell_index = cell_y * self.cols + cell_x;
        let mut candidate = self.head[cell_index];

        while candidate != INVALID_INDEX {
            if candidate != i {
                let raw_dx = self.cached_x[candidate] - x;
                let raw_dy = self.cached_y[candidate] - y;
                let dx = if wrap_x {
                    wrapped_delta(raw_dx, self.width)
                } else {
                    raw_dx
                };
                let dy = if wrap_y {
                    wrapped_delta(raw_dy, self.height)
                } else {
                    raw_dy
                };
                if dx * dx + dy * dy <= radius_sq {
                    callback(candidate);
                }
            }

            candidate = self.next[candidate];
        }
    }
}

fn wrap_cell_index(index: isize, len: usize) -> usize {
    index.rem_euclid(len as isize) as usize
}

fn wrapped_delta(delta: f32, world_extent: f32) -> f32 {
    let half_extent = world_extent * 0.5;
    if delta > half_extent {
        delta - world_extent
    } else if delta < -half_extent {
        delta + world_extent
    } else {
        delta
    }
}

#[cfg(test)]
mod tests {
    use super::NeighborGrid;

    fn sorted_neighbors(grid: &NeighborGrid, i: usize, radius: f32) -> Vec<usize> {
        let mut neighbors = Vec::new();
        grid.for_each_neighbor_with_wrap(i, radius, true, true, |j| neighbors.push(j));
        neighbors.sort_unstable();
        neighbors
    }

    #[test]
    fn finds_neighbors_in_known_layout() {
        let pos_x = vec![1.0, 1.5, 8.0, 2.7];
        let pos_y = vec![1.0, 1.2, 8.0, 1.1];

        let mut grid = NeighborGrid::new(pos_x.len(), 10.0, 10.0, 2.0);
        grid.rebuild(&pos_x, &pos_y, 10.0, 10.0);

        assert_eq!(sorted_neighbors(&grid, 0, 2.0), vec![1, 3]);
        assert_eq!(sorted_neighbors(&grid, 2, 2.0), Vec::<usize>::new());
    }

    #[test]
    fn checks_across_cell_boundaries() {
        let pos_x = vec![1.9, 2.1, 5.0];
        let pos_y = vec![1.0, 1.0, 5.0];

        let mut grid = NeighborGrid::new(pos_x.len(), 10.0, 10.0, 2.0);
        grid.rebuild(&pos_x, &pos_y, 10.0, 10.0);

        assert_eq!(sorted_neighbors(&grid, 0, 0.25), vec![1]);
        assert_eq!(sorted_neighbors(&grid, 1, 0.25), vec![0]);
    }
}

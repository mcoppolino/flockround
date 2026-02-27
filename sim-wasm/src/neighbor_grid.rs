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

    pub fn for_each_neighbor<F>(&self, i: usize, radius: f32, mut callback: F)
    where
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
        let cell_x = self.cell_x(x);
        let cell_y = self.cell_y(y);

        let min_x = (cell_x - cell_radius).max(0);
        let max_x = (cell_x + cell_radius).min(self.cols as isize - 1);
        let min_y = (cell_y - cell_radius).max(0);
        let max_y = (cell_y + cell_radius).min(self.rows as isize - 1);

        for cy in min_y..=max_y {
            for cx in min_x..=max_x {
                let cell_index = cy as usize * self.cols + cx as usize;
                let mut candidate = self.head[cell_index];

                while candidate != INVALID_INDEX {
                    if candidate != i {
                        let dx = self.cached_x[candidate] - x;
                        let dy = self.cached_y[candidate] - y;
                        if dx * dx + dy * dy <= radius_sq {
                            callback(candidate);
                        }
                    }

                    candidate = self.next[candidate];
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
}

#[cfg(test)]
mod tests {
    use super::NeighborGrid;

    fn sorted_neighbors(grid: &NeighborGrid, i: usize, radius: f32) -> Vec<usize> {
        let mut neighbors = Vec::new();
        grid.for_each_neighbor(i, radius, |j| neighbors.push(j));
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

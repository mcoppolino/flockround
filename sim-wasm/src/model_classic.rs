use crate::{
    axis_delta, hash_unit, integrate_axis, math, steer_towards_3d, Sim, DEFAULT_Z_LAYER, EPSILON,
    WORLD_SIZE,
};

impl Sim {
    pub(super) fn step_classic(&mut self, dt: f32) {
        self.step_index = self.step_index.wrapping_add(1);
        self.neighbors_visited_last_step = 0;

        // If steering cannot produce non-zero acceleration, skip neighbor/force work.
        let steering_disabled = self.config.max_force <= EPSILON
            || ((self.config.sep_weight <= EPSILON
                && self.config.align_weight <= EPSILON
                && self.config.coh_weight <= EPSILON)
                && self.config.jitter_strength <= EPSILON
                && self.config.shape_attractor_weight <= EPSILON);
        let drag_damping = if self.config.drag <= EPSILON {
            1.0
        } else {
            (-self.config.drag * dt).exp()
        };

        if steering_disabled {
            for i in 0..self.active_count {
                let vx = self.vel_x[i] * drag_damping;
                let vy = self.vel_y[i] * drag_damping;
                let vz = if self.z_mode_enabled {
                    self.vel_z[i] * drag_damping
                } else {
                    0.0
                };

                let (x, vx) = integrate_axis(self.pos_x[i], vx, dt, self.bounce_x);
                let (y, vy) = integrate_axis(self.pos_y[i], vy, dt, self.bounce_y);
                let (z, vz) = if self.z_mode_enabled {
                    integrate_axis(self.pos_z[i], vz, dt, self.bounce_z)
                } else {
                    (DEFAULT_Z_LAYER, 0.0)
                };

                self.vel_x[i] = vx;
                self.vel_y[i] = vy;
                self.vel_z[i] = if self.z_mode_enabled { vz } else { 0.0 };
                self.pos_x[i] = x;
                self.pos_y[i] = y;
                self.pos_z[i] = z;
            }

            self.resolve_hard_min_distance_constraints();
            self.sync_render_buffers();
            self.debug_validate_state();
            return;
        }

        self.neighbor_grid
            .set_cell_size(self.config.neighbor_radius);
        self.neighbor_grid.rebuild(
            &self.pos_x[..self.active_count],
            &self.pos_y[..self.active_count],
            WORLD_SIZE,
            WORLD_SIZE,
        );

        for i in 0..self.active_count {
            let (ax, ay, az, neighbors_used) = self.compute_boids_acceleration(i);
            self.accel_x[i] = ax;
            self.accel_y[i] = ay;
            self.accel_z[i] = az;
            self.neighbors_visited_last_step += neighbors_used;
        }

        for i in 0..self.active_count {
            let mut vx = (self.vel_x[i] + self.accel_x[i] * dt) * drag_damping;
            let mut vy = (self.vel_y[i] + self.accel_y[i] * dt) * drag_damping;
            let mut vz = if self.z_mode_enabled {
                (self.vel_z[i] + self.accel_z[i] * dt) * drag_damping
            } else {
                0.0
            };

            let speed_sq = if self.z_mode_enabled {
                vx * vx + vy * vy + vz * vz
            } else {
                vx * vx + vy * vy
            };

            if speed_sq <= EPSILON {
                if self.config.min_speed > 0.0 {
                    vx = self.config.min_speed;
                    vy = 0.0;
                    vz = 0.0;
                }
            } else {
                let min_speed_sq = self.config.min_speed * self.config.min_speed;
                let max_speed_sq = self.config.max_speed * self.config.max_speed;
                if speed_sq < min_speed_sq {
                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        self.config.min_speed,
                    );
                    vx = nvx;
                    vy = nvy;
                    if self.z_mode_enabled {
                        vz = nvz;
                    }
                } else if speed_sq > max_speed_sq {
                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        self.config.max_speed,
                    );
                    vx = nvx;
                    vy = nvy;
                    if self.z_mode_enabled {
                        vz = nvz;
                    }
                }
            }

            let (x, vx) = integrate_axis(self.pos_x[i], vx, dt, self.bounce_x);
            let (y, vy) = integrate_axis(self.pos_y[i], vy, dt, self.bounce_y);
            let (z, vz) = if self.z_mode_enabled {
                integrate_axis(self.pos_z[i], vz, dt, self.bounce_z)
            } else {
                (DEFAULT_Z_LAYER, 0.0)
            };

            self.vel_x[i] = vx;
            self.vel_y[i] = vy;
            self.vel_z[i] = if self.z_mode_enabled { vz } else { 0.0 };
            self.pos_x[i] = x;
            self.pos_y[i] = y;
            self.pos_z[i] = z;
        }

        self.resolve_hard_min_distance_constraints();
        self.sync_render_buffers();
        self.debug_validate_state();
    }

    fn compute_boids_acceleration(&self, i: usize) -> (f32, f32, f32, usize) {
        let wrap_x = !self.bounce_x;
        let wrap_y = !self.bounce_y;
        let wrap_z = !self.bounce_z;
        let px = self.pos_x[i];
        let py = self.pos_y[i];
        let pz = self.pos_z[i];
        let vx = self.vel_x[i];
        let vy = self.vel_y[i];
        let vz = self.vel_z[i];

        let neighbor_radius_sq = self.config.neighbor_radius * self.config.neighbor_radius;
        let separation_radius_sq = self.config.separation_radius * self.config.separation_radius;
        let min_distance_sq = self.config.soft_min_distance * self.config.soft_min_distance;

        let mut sep_x = 0.0;
        let mut sep_y = 0.0;
        let mut sep_z = 0.0;
        let mut sep_count = 0usize;

        let mut align_x = 0.0;
        let mut align_y = 0.0;
        let mut align_z = 0.0;

        let mut coh_x = 0.0;
        let mut coh_y = 0.0;
        let mut coh_z = 0.0;

        let mut neighbor_count = 0usize;
        let mut neighbor_samples = 0usize;
        let sample_cap = self.config.max_neighbors_sampled;

        self.neighbor_grid.for_each_neighbor_with_wrap(
            i,
            self.config.neighbor_radius,
            wrap_x,
            wrap_y,
            |j| {
                if sample_cap > 0 && neighbor_samples >= sample_cap {
                    return false;
                }
                neighbor_samples += 1;

                let dx = axis_delta(self.pos_x[j] - px, wrap_x);
                let dy = axis_delta(self.pos_y[j] - py, wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
                let dist_sq = math::distance_sq_3d(dx, dy, dz);

                if dist_sq <= EPSILON || dist_sq > neighbor_radius_sq {
                    return true;
                }

                neighbor_count += 1;
                align_x += self.vel_x[j];
                align_y += self.vel_y[j];
                align_z += if self.z_mode_enabled {
                    self.vel_z[j]
                } else {
                    0.0
                };

                coh_x += dx;
                coh_y += dy;
                coh_z += dz;

                if dist_sq <= separation_radius_sq {
                    let inv_dist_sq = 1.0 / dist_sq.max(EPSILON);
                    sep_x -= dx * inv_dist_sq;
                    sep_y -= dy * inv_dist_sq;
                    sep_z -= dz * inv_dist_sq;

                    if min_distance_sq > EPSILON && dist_sq < min_distance_sq {
                        let hard_push_mag =
                            self.config.soft_min_distance * (1.0 - dist_sq / min_distance_sq);
                        let (hard_x, hard_y, hard_z) = math::normalize_to_magnitude(
                            self.config.math_mode,
                            -dx,
                            -dy,
                            if self.z_mode_enabled { -dz } else { 0.0 },
                            hard_push_mag,
                        );
                        sep_x += hard_x;
                        sep_y += hard_y;
                        sep_z += hard_z;
                    }

                    sep_count += 1;
                }

                true
            },
        );

        let mut force_x = 0.0;
        let mut force_y = 0.0;
        let mut force_z = 0.0;

        if sep_count > 0 {
            let n = sep_count as f32;
            let (steer_x, steer_y, steer_z) = steer_towards_3d(
                self.config.math_mode,
                sep_x / n,
                sep_y / n,
                sep_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += steer_x * self.config.sep_weight;
            force_y += steer_y * self.config.sep_weight;
            force_z += steer_z * self.config.sep_weight * self.z_force_scale;
        }

        if neighbor_count > 0 {
            let n = neighbor_count as f32;

            let (align_force_x, align_force_y, align_force_z) = steer_towards_3d(
                self.config.math_mode,
                align_x / n,
                align_y / n,
                align_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += align_force_x * self.config.align_weight;
            force_y += align_force_y * self.config.align_weight;
            force_z += align_force_z * self.config.align_weight * self.z_force_scale;

            let (coh_force_x, coh_force_y, coh_force_z) = steer_towards_3d(
                self.config.math_mode,
                coh_x / n,
                coh_y / n,
                coh_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += coh_force_x * self.config.coh_weight;
            force_y += coh_force_y * self.config.coh_weight;
            force_z += coh_force_z * self.config.coh_weight * self.z_force_scale;
        }

        if !self.z_mode_enabled {
            force_z = 0.0;
        }

        if self.config.jitter_strength > 0.0 {
            force_x += hash_unit(self.step_index, i as u32, 0) * self.config.jitter_strength;
            force_y += hash_unit(self.step_index, i as u32, 1) * self.config.jitter_strength;
            if self.z_mode_enabled {
                force_z += hash_unit(self.step_index, i as u32, 2) * self.config.jitter_strength;
            }
        }

        let (shape_force_x, shape_force_y, shape_force_z) = self.shape_attractor_force(i);
        force_x += shape_force_x;
        force_y += shape_force_y;
        force_z += shape_force_z * self.z_force_scale;

        let (fx, fy, fz) = math::limit_magnitude_3d(
            self.config.math_mode,
            force_x,
            force_y,
            force_z,
            self.config.max_force,
        );

        (fx, fy, fz, neighbor_count)
    }
}

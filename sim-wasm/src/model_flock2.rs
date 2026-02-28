use crate::flock2::{
    dot3, heading_basis, normalize_or_default, rotate_vector_around_axis,
    FLOCK2_MAX_TOPOLOGICAL_NEIGHBORS, FLOCK2_WORLD_SCALE,
};
use crate::{
    axis_delta, clamp_finite, integrate_axis, math, ModelKind, Sim, DEFAULT_Z_LAYER, EPSILON,
    WORLD_SIZE,
};

impl Sim {
    pub(super) fn reseed_velocity_for_model(&mut self) {
        match self.model_kind {
            ModelKind::Classic => {
                for i in 0..self.count {
                    let mut vx = self.vel_x[i] * FLOCK2_WORLD_SCALE;
                    let mut vy = self.vel_y[i] * FLOCK2_WORLD_SCALE;
                    let mut vz = if self.z_mode_enabled {
                        self.vel_z[i] * FLOCK2_WORLD_SCALE
                    } else {
                        0.0
                    };

                    let speed_sq =
                        vx * vx + vy * vy + if self.z_mode_enabled { vz * vz } else { 0.0 };
                    if speed_sq <= EPSILON {
                        vx = self.heading_x[i] * self.config.min_speed;
                        vy = self.heading_y[i] * self.config.min_speed;
                        vz = if self.z_mode_enabled {
                            self.heading_z[i] * self.config.min_speed
                        } else {
                            0.0
                        };
                    }

                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        clamp_finite(
                            (speed_sq.max(EPSILON)).sqrt(),
                            self.config.min_speed,
                            self.config.max_speed,
                            self.config.min_speed.max(0.01),
                        ),
                    );
                    self.vel_x[i] = nvx;
                    self.vel_y[i] = nvy;
                    self.vel_z[i] = if self.z_mode_enabled { nvz } else { 0.0 };
                    let (hx, hy, hz) = normalize_or_default(
                        self.vel_x[i],
                        self.vel_y[i],
                        self.vel_z[i],
                        1.0,
                        0.0,
                        0.0,
                    );
                    self.heading_x[i] = hx;
                    self.heading_y[i] = hy;
                    self.heading_z[i] = if self.z_mode_enabled { hz } else { 0.0 };
                }
            }
            ModelKind::Flock2Social
            | ModelKind::Flock2SocialFlight
            | ModelKind::Flock2LiteSocial
            | ModelKind::Flock2LiteSocialFlight => {
                self.flock2_config.sanitize();
                self.neighbor_grid
                    .set_cell_size(self.flock2_config.neighbor_radius);

                for i in 0..self.count {
                    let mut vx = self.vel_x[i] / FLOCK2_WORLD_SCALE;
                    let mut vy = self.vel_y[i] / FLOCK2_WORLD_SCALE;
                    let mut vz = if self.z_mode_enabled {
                        self.vel_z[i] / FLOCK2_WORLD_SCALE
                    } else {
                        0.0
                    };
                    let speed_sq =
                        vx * vx + vy * vy + if self.z_mode_enabled { vz * vz } else { 0.0 };
                    if speed_sq <= EPSILON {
                        vx = self.heading_x[i] * self.flock2_config.min_speed;
                        vy = self.heading_y[i] * self.flock2_config.min_speed;
                        vz = if self.z_mode_enabled {
                            self.heading_z[i] * self.flock2_config.min_speed
                        } else {
                            0.0
                        };
                    }

                    let speed = clamp_finite(
                        speed_sq.sqrt(),
                        self.flock2_config.min_speed,
                        self.flock2_config.max_speed,
                        self.flock2_config.min_speed,
                    );
                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        speed,
                    );
                    self.vel_x[i] = nvx;
                    self.vel_y[i] = nvy;
                    self.vel_z[i] = if self.z_mode_enabled { nvz } else { 0.0 };
                    let (hx, hy, hz) = normalize_or_default(
                        self.vel_x[i],
                        self.vel_y[i],
                        self.vel_z[i],
                        1.0,
                        0.0,
                        0.0,
                    );
                    self.heading_x[i] = hx;
                    self.heading_y[i] = hy;
                    self.heading_z[i] = if self.z_mode_enabled { hz } else { 0.0 };
                }
            }
        }
    }

    pub(super) fn step_flock2(&mut self, dt: f32, with_flight: bool) {
        self.step_index = self.step_index.wrapping_add(1);
        self.neighbors_visited_last_step = 0;

        self.flock2_config.sanitize();
        self.neighbor_grid
            .set_cell_size(self.flock2_config.neighbor_radius);
        self.neighbor_grid.rebuild(
            &self.pos_x[..self.active_count],
            &self.pos_y[..self.active_count],
            WORLD_SIZE,
            WORLD_SIZE,
        );

        let mut centroid_x = 0.0;
        let mut centroid_y = 0.0;
        let mut centroid_z = 0.0;
        for i in 0..self.active_count {
            centroid_x += self.pos_x[i];
            centroid_y += self.pos_y[i];
            centroid_z += if self.z_mode_enabled {
                self.pos_z[i]
            } else {
                DEFAULT_Z_LAYER
            };
        }
        let inv_active = 1.0 / self.active_count as f32;
        centroid_x *= inv_active;
        centroid_y *= inv_active;
        centroid_z *= inv_active;

        for i in 0..self.active_count {
            let (next_hx, next_hy, next_hz, neighbors_used) =
                self.compute_flock2_heading(i, dt, centroid_x, centroid_y, centroid_z);
            self.accel_x[i] = next_hx;
            self.accel_y[i] = next_hy;
            self.accel_z[i] = next_hz;
            self.neighbors_visited_last_step += neighbors_used;
        }

        for i in 0..self.active_count {
            self.heading_x[i] = self.accel_x[i];
            self.heading_y[i] = self.accel_y[i];
            self.heading_z[i] = if self.z_mode_enabled {
                self.accel_z[i]
            } else {
                0.0
            };

            let mut speed = (self.vel_x[i] * self.vel_x[i]
                + self.vel_y[i] * self.vel_y[i]
                + if self.z_mode_enabled {
                    self.vel_z[i] * self.vel_z[i]
                } else {
                    0.0
                })
            .sqrt();
            if speed <= EPSILON {
                speed = self.flock2_config.min_speed;
            }
            speed = speed.clamp(self.flock2_config.min_speed, self.flock2_config.max_speed);

            if with_flight {
                let v_axis = if speed > EPSILON {
                    (
                        self.vel_x[i] / speed,
                        self.vel_y[i] / speed,
                        if self.z_mode_enabled {
                            self.vel_z[i] / speed
                        } else {
                            0.0
                        },
                    )
                } else {
                    (self.heading_x[i], self.heading_y[i], self.heading_z[i])
                };

                let (_, _, _, up_x, up_y, up_z, _, _, _) = heading_basis(
                    self.heading_x[i],
                    self.heading_y[i],
                    if self.z_mode_enabled {
                        self.heading_z[i]
                    } else {
                        0.0
                    },
                );

                let dynamic_pressure = 0.5
                    * self.flock2_config.air_density
                    * speed.max(self.flock2_config.min_speed).powi(2);
                let lift_mag = dynamic_pressure
                    * self.flock2_config.lift_factor
                    * self.flock2_config.wing_area;
                let drag_mag = dynamic_pressure
                    * self.flock2_config.drag_factor
                    * self.flock2_config.wing_area;
                let gravity_force = self.flock2_config.gravity * self.flock2_config.mass;

                let lift_x = up_x * lift_mag;
                let lift_y = up_y * lift_mag;
                let lift_z = if self.z_mode_enabled {
                    up_z * lift_mag
                } else {
                    0.0
                };

                let drag_x = -v_axis.0 * drag_mag;
                let drag_y = -v_axis.1 * drag_mag;
                let drag_z = if self.z_mode_enabled {
                    -v_axis.2 * drag_mag
                } else {
                    0.0
                };

                let thrust_x = self.heading_x[i] * self.flock2_config.thrust;
                let thrust_y = self.heading_y[i] * self.flock2_config.thrust;
                let thrust_z = if self.z_mode_enabled {
                    self.heading_z[i] * self.flock2_config.thrust
                } else {
                    0.0
                };

                let force_x = lift_x + drag_x + thrust_x;
                let force_y = lift_y + drag_y + thrust_y - gravity_force;
                let force_z = if self.z_mode_enabled {
                    lift_z + drag_z + thrust_z
                } else {
                    0.0
                };

                self.accel_x[i] = force_x / self.flock2_config.mass;
                self.accel_y[i] = force_y / self.flock2_config.mass;
                self.accel_z[i] = if self.z_mode_enabled {
                    force_z / self.flock2_config.mass
                } else {
                    0.0
                };

                self.vel_x[i] += self.accel_x[i] * dt;
                self.vel_y[i] += self.accel_y[i] * dt;
                if self.z_mode_enabled {
                    self.vel_z[i] += self.accel_z[i] * dt;
                } else {
                    self.vel_z[i] = 0.0;
                }
            } else {
                self.accel_x[i] = 0.0;
                self.accel_y[i] = 0.0;
                self.accel_z[i] = 0.0;
                self.vel_x[i] = self.heading_x[i] * speed;
                self.vel_y[i] = self.heading_y[i] * speed;
                self.vel_z[i] = if self.z_mode_enabled {
                    self.heading_z[i] * speed
                } else {
                    0.0
                };
            }

            let (shape_force_x, shape_force_y, shape_force_z) = self.shape_attractor_force(i);
            self.vel_x[i] += shape_force_x * dt;
            self.vel_y[i] += shape_force_y * dt;
            if self.z_mode_enabled {
                self.vel_z[i] += shape_force_z * dt;
            } else {
                self.vel_z[i] = 0.0;
            }

            let (vx, vy, vz) = math::normalize_to_magnitude(
                self.config.math_mode,
                self.vel_x[i],
                self.vel_y[i],
                if self.z_mode_enabled {
                    self.vel_z[i]
                } else {
                    0.0
                },
                clamp_finite(
                    (self.vel_x[i] * self.vel_x[i]
                        + self.vel_y[i] * self.vel_y[i]
                        + if self.z_mode_enabled {
                            self.vel_z[i] * self.vel_z[i]
                        } else {
                            0.0
                        })
                    .sqrt(),
                    self.flock2_config.min_speed,
                    self.flock2_config.max_speed,
                    self.flock2_config.min_speed,
                ),
            );
            self.vel_x[i] = vx;
            self.vel_y[i] = vy;
            self.vel_z[i] = if self.z_mode_enabled { vz } else { 0.0 };

            let vel_norm = normalize_or_default(
                self.vel_x[i],
                self.vel_y[i],
                if self.z_mode_enabled {
                    self.vel_z[i]
                } else {
                    0.0
                },
                self.heading_x[i],
                self.heading_y[i],
                if self.z_mode_enabled {
                    self.heading_z[i]
                } else {
                    0.0
                },
            );
            let stability_gain = if with_flight {
                (self.flock2_config.dynamic_stability * dt * 60.0).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let blended_hx =
                self.heading_x[i] * (1.0 - stability_gain) + vel_norm.0 * stability_gain;
            let blended_hy =
                self.heading_y[i] * (1.0 - stability_gain) + vel_norm.1 * stability_gain;
            let blended_hz = if self.z_mode_enabled {
                self.heading_z[i] * (1.0 - stability_gain) + vel_norm.2 * stability_gain
            } else {
                0.0
            };
            let (hx, hy, hz) =
                normalize_or_default(blended_hx, blended_hy, blended_hz, 1.0, 0.0, 0.0);
            self.heading_x[i] = hx;
            self.heading_y[i] = hy;
            self.heading_z[i] = if self.z_mode_enabled { hz } else { 0.0 };

            let vx_world = self.vel_x[i] * FLOCK2_WORLD_SCALE;
            let vy_world = self.vel_y[i] * FLOCK2_WORLD_SCALE;
            let vz_world = if self.z_mode_enabled {
                self.vel_z[i] * FLOCK2_WORLD_SCALE
            } else {
                0.0
            };

            let (x, vx_world_reflect) = integrate_axis(self.pos_x[i], vx_world, dt, self.bounce_x);
            let (y, vy_world_reflect) = integrate_axis(self.pos_y[i], vy_world, dt, self.bounce_y);
            let (z, vz_world_reflect) = if self.z_mode_enabled {
                integrate_axis(self.pos_z[i], vz_world, dt, self.bounce_z)
            } else {
                (DEFAULT_Z_LAYER, 0.0)
            };

            self.pos_x[i] = x;
            self.pos_y[i] = y;
            self.pos_z[i] = z;
            self.vel_x[i] = vx_world_reflect / FLOCK2_WORLD_SCALE;
            self.vel_y[i] = vy_world_reflect / FLOCK2_WORLD_SCALE;
            self.vel_z[i] = if self.z_mode_enabled {
                vz_world_reflect / FLOCK2_WORLD_SCALE
            } else {
                0.0
            };
        }

        self.sync_render_buffers();
        self.debug_validate_state();
    }

    pub(super) fn step_flock2_lite(&mut self, dt: f32, with_flight: bool) {
        self.step_index = self.step_index.wrapping_add(1);
        self.neighbors_visited_last_step = 0;

        self.flock2_config.sanitize();
        self.neighbor_grid
            .set_cell_size(self.flock2_config.neighbor_radius);
        self.neighbor_grid.rebuild(
            &self.pos_x[..self.active_count],
            &self.pos_y[..self.active_count],
            WORLD_SIZE,
            WORLD_SIZE,
        );

        let mut centroid_x = 0.0;
        let mut centroid_y = 0.0;
        let mut centroid_z = 0.0;
        for i in 0..self.active_count {
            centroid_x += self.pos_x[i];
            centroid_y += self.pos_y[i];
            centroid_z += if self.z_mode_enabled {
                self.pos_z[i]
            } else {
                DEFAULT_Z_LAYER
            };
        }
        let inv_active = 1.0 / self.active_count as f32;
        centroid_x *= inv_active;
        centroid_y *= inv_active;
        centroid_z *= inv_active;

        for i in 0..self.active_count {
            let (next_hx, next_hy, next_hz, neighbors_used) =
                self.compute_flock2_lite_heading(i, dt, centroid_x, centroid_y, centroid_z);
            self.accel_x[i] = next_hx;
            self.accel_y[i] = next_hy;
            self.accel_z[i] = next_hz;
            self.neighbors_visited_last_step += neighbors_used;
        }

        for i in 0..self.active_count {
            self.heading_x[i] = self.accel_x[i];
            self.heading_y[i] = self.accel_y[i];
            self.heading_z[i] = if self.z_mode_enabled {
                self.accel_z[i]
            } else {
                0.0
            };

            let mut speed = (self.vel_x[i] * self.vel_x[i]
                + self.vel_y[i] * self.vel_y[i]
                + if self.z_mode_enabled {
                    self.vel_z[i] * self.vel_z[i]
                } else {
                    0.0
                })
            .sqrt()
            .max(self.flock2_config.min_speed);

            if with_flight {
                let drag_loss = self.flock2_config.drag_factor * speed * speed * 0.01;
                let climb_loss = self.flock2_config.gravity * self.heading_y[i].max(0.0) * 0.02;
                speed += (self.flock2_config.thrust - drag_loss - climb_loss) * dt;
            }
            speed = speed.clamp(self.flock2_config.min_speed, self.flock2_config.max_speed);

            self.vel_x[i] = self.heading_x[i] * speed;
            self.vel_y[i] = self.heading_y[i] * speed;
            self.vel_z[i] = if self.z_mode_enabled {
                self.heading_z[i] * speed
            } else {
                0.0
            };

            let (shape_force_x, shape_force_y, shape_force_z) = self.shape_attractor_force(i);
            self.vel_x[i] += shape_force_x * dt;
            self.vel_y[i] += shape_force_y * dt;
            if self.z_mode_enabled {
                self.vel_z[i] += shape_force_z * dt;
            } else {
                self.vel_z[i] = 0.0;
            }

            let (vx, vy, vz) = math::normalize_to_magnitude(
                self.config.math_mode,
                self.vel_x[i],
                self.vel_y[i],
                if self.z_mode_enabled {
                    self.vel_z[i]
                } else {
                    0.0
                },
                clamp_finite(
                    (self.vel_x[i] * self.vel_x[i]
                        + self.vel_y[i] * self.vel_y[i]
                        + if self.z_mode_enabled {
                            self.vel_z[i] * self.vel_z[i]
                        } else {
                            0.0
                        })
                    .sqrt(),
                    self.flock2_config.min_speed,
                    self.flock2_config.max_speed,
                    self.flock2_config.min_speed,
                ),
            );
            self.vel_x[i] = vx;
            self.vel_y[i] = vy;
            self.vel_z[i] = if self.z_mode_enabled { vz } else { 0.0 };

            let vx_world = self.vel_x[i] * FLOCK2_WORLD_SCALE;
            let vy_world = self.vel_y[i] * FLOCK2_WORLD_SCALE;
            let vz_world = if self.z_mode_enabled {
                self.vel_z[i] * FLOCK2_WORLD_SCALE
            } else {
                0.0
            };
            let (x, vx_world_reflect) = integrate_axis(self.pos_x[i], vx_world, dt, self.bounce_x);
            let (y, vy_world_reflect) = integrate_axis(self.pos_y[i], vy_world, dt, self.bounce_y);
            let (z, vz_world_reflect) = if self.z_mode_enabled {
                integrate_axis(self.pos_z[i], vz_world, dt, self.bounce_z)
            } else {
                (DEFAULT_Z_LAYER, 0.0)
            };

            self.pos_x[i] = x;
            self.pos_y[i] = y;
            self.pos_z[i] = z;
            self.vel_x[i] = vx_world_reflect / FLOCK2_WORLD_SCALE;
            self.vel_y[i] = vy_world_reflect / FLOCK2_WORLD_SCALE;
            self.vel_z[i] = if self.z_mode_enabled {
                vz_world_reflect / FLOCK2_WORLD_SCALE
            } else {
                0.0
            };
        }

        self.sync_render_buffers();
        self.debug_validate_state();
    }

    fn compute_flock2_heading(
        &self,
        i: usize,
        dt: f32,
        centroid_x: f32,
        centroid_y: f32,
        centroid_z: f32,
    ) -> (f32, f32, f32, usize) {
        let wrap_x = !self.bounce_x;
        let wrap_y = !self.bounce_y;
        let wrap_z = !self.bounce_z;
        let px = self.pos_x[i];
        let py = self.pos_y[i];
        let pz = self.pos_z[i];
        let (fwd_x, fwd_y, fwd_z) = normalize_or_default(
            self.heading_x[i],
            self.heading_y[i],
            if self.z_mode_enabled {
                self.heading_z[i]
            } else {
                0.0
            },
            1.0,
            0.0,
            0.0,
        );
        let (_, _, _, up_x, up_y, up_z, right_x, right_y, right_z) =
            heading_basis(fwd_x, fwd_y, fwd_z);

        let mut nearest_index = usize::MAX;
        let mut nearest_dist_sq = f32::MAX;
        let mut topological_indices = [usize::MAX; FLOCK2_MAX_TOPOLOGICAL_NEIGHBORS];
        let mut topological_dsq = [f32::MAX; FLOCK2_MAX_TOPOLOGICAL_NEIGHBORS];
        let mut topological_count = 0usize;
        let mut visible_neighbors = 0usize;
        let mut candidates_visited = 0usize;
        let topological_cap = self.flock2_config.topological_neighbors;
        let fov_cos = self.flock2_config.fov_cos();
        let search_radius_sq =
            self.flock2_config.neighbor_radius * self.flock2_config.neighbor_radius;

        self.neighbor_grid.for_each_neighbor_with_wrap(
            i,
            self.flock2_config.neighbor_radius,
            wrap_x,
            wrap_y,
            |j| {
                let dx = axis_delta(self.pos_x[j] - px, wrap_x);
                let dy = axis_delta(self.pos_y[j] - py, wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
                let dist_sq = math::distance_sq_3d(dx, dy, dz);
                if dist_sq <= EPSILON || dist_sq > search_radius_sq {
                    return true;
                }

                let inv_dist = 1.0 / dist_sq.sqrt();
                let dir_x = dx * inv_dist;
                let dir_y = dy * inv_dist;
                let dir_z = if self.z_mode_enabled {
                    dz * inv_dist
                } else {
                    0.0
                };
                let forward_dot = dot3(fwd_x, fwd_y, fwd_z, dir_x, dir_y, dir_z);
                if forward_dot < fov_cos {
                    return true;
                }

                visible_neighbors += 1;
                candidates_visited += 1;
                if dist_sq < nearest_dist_sq {
                    nearest_dist_sq = dist_sq;
                    nearest_index = j;
                }

                let mut insert_at = topological_count;
                while insert_at > 0 && dist_sq < topological_dsq[insert_at - 1] {
                    insert_at -= 1;
                }
                if insert_at < topological_cap {
                    let last = topological_count.min(topological_cap.saturating_sub(1));
                    let mut m = last;
                    while m > insert_at {
                        topological_dsq[m] = topological_dsq[m - 1];
                        topological_indices[m] = topological_indices[m - 1];
                        m -= 1;
                    }
                    topological_dsq[insert_at] = dist_sq;
                    topological_indices[insert_at] = j;
                    if topological_count < topological_cap {
                        topological_count += 1;
                    }
                }

                true
            },
        );

        let mut target_yaw = 0.0;
        let mut target_pitch = 0.0;

        if nearest_index != usize::MAX {
            let dx = axis_delta(self.pos_x[nearest_index] - px, wrap_x);
            let dy = axis_delta(self.pos_y[nearest_index] - py, wrap_y);
            let dz = if self.z_mode_enabled {
                axis_delta(self.pos_z[nearest_index] - pz, wrap_z)
            } else {
                0.0
            };
            let (dir_x, dir_y, dir_z) = normalize_or_default(-dx, -dy, -dz, 0.0, 0.0, 0.0);
            let local_x = dot3(dir_x, dir_y, dir_z, fwd_x, fwd_y, fwd_z);
            let local_y = dot3(dir_x, dir_y, dir_z, up_x, up_y, up_z).clamp(-1.0, 1.0);
            let local_z = dot3(dir_x, dir_y, dir_z, right_x, right_y, right_z);
            target_yaw += local_z.atan2(local_x) * self.flock2_config.avoid_weight;
            target_pitch += local_y.asin() * self.flock2_config.avoid_weight;
        }

        if topological_count > 0 {
            let mut ave_vel_x = 0.0;
            let mut ave_vel_y = 0.0;
            let mut ave_vel_z = 0.0;
            let mut ave_pos_dx = 0.0;
            let mut ave_pos_dy = 0.0;
            let mut ave_pos_dz = 0.0;

            for idx in topological_indices.iter().take(topological_count) {
                let j = *idx;
                ave_vel_x += self.vel_x[j];
                ave_vel_y += self.vel_y[j];
                ave_vel_z += if self.z_mode_enabled {
                    self.vel_z[j]
                } else {
                    0.0
                };
                ave_pos_dx += axis_delta(self.pos_x[j] - px, wrap_x);
                ave_pos_dy += axis_delta(self.pos_y[j] - py, wrap_y);
                ave_pos_dz += if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
            }

            let inv_n = 1.0 / topological_count as f32;
            ave_vel_x *= inv_n;
            ave_vel_y *= inv_n;
            ave_vel_z *= inv_n;
            ave_pos_dx *= inv_n;
            ave_pos_dy *= inv_n;
            ave_pos_dz *= inv_n;

            let (align_x, align_y, align_z) =
                normalize_or_default(ave_vel_x, ave_vel_y, ave_vel_z, 0.0, 0.0, 0.0);
            let align_local_x = dot3(align_x, align_y, align_z, fwd_x, fwd_y, fwd_z);
            let align_local_y = dot3(align_x, align_y, align_z, up_x, up_y, up_z).clamp(-1.0, 1.0);
            let align_local_z = dot3(align_x, align_y, align_z, right_x, right_y, right_z);
            target_yaw += align_local_z.atan2(align_local_x) * self.flock2_config.align_weight;
            target_pitch += align_local_y.asin() * self.flock2_config.align_weight;

            let (coh_x, coh_y, coh_z) =
                normalize_or_default(ave_pos_dx, ave_pos_dy, ave_pos_dz, 0.0, 0.0, 0.0);
            let coh_local_x = dot3(coh_x, coh_y, coh_z, fwd_x, fwd_y, fwd_z);
            let coh_local_y = dot3(coh_x, coh_y, coh_z, up_x, up_y, up_z).clamp(-1.0, 1.0);
            let coh_local_z = dot3(coh_x, coh_y, coh_z, right_x, right_y, right_z);
            target_yaw += coh_local_z.atan2(coh_local_x) * self.flock2_config.cohesion_weight;
            target_pitch += coh_local_y.asin() * self.flock2_config.cohesion_weight;
        }

        if self.flock2_config.boundary_count > EPSILON
            && (visible_neighbors as f32) < self.flock2_config.boundary_count
        {
            let boundary_ratio = ((self.flock2_config.boundary_count - visible_neighbors as f32)
                / self.flock2_config.boundary_count)
                .clamp(0.0, 1.0);
            let to_centroid_x = axis_delta(centroid_x - px, wrap_x);
            let to_centroid_y = axis_delta(centroid_y - py, wrap_y);
            let to_centroid_z = if self.z_mode_enabled {
                axis_delta(centroid_z - pz, wrap_z)
            } else {
                0.0
            };
            let (bound_x, bound_y, bound_z) =
                normalize_or_default(to_centroid_x, to_centroid_y, to_centroid_z, 0.0, 0.0, 0.0);
            let bound_local_x = dot3(bound_x, bound_y, bound_z, fwd_x, fwd_y, fwd_z);
            let bound_local_y = dot3(bound_x, bound_y, bound_z, up_x, up_y, up_z).clamp(-1.0, 1.0);
            let bound_local_z = dot3(bound_x, bound_y, bound_z, right_x, right_y, right_z);
            target_yaw += bound_local_z.atan2(bound_local_x)
                * self.flock2_config.boundary_weight
                * boundary_ratio;
            target_pitch +=
                bound_local_y.asin() * self.flock2_config.boundary_weight * boundary_ratio;
        }

        let reaction_gain = (dt * 1_000.0 / self.flock2_config.reaction_time_ms).clamp(0.0, 1.0);
        let mut next_heading = rotate_vector_around_axis(
            (fwd_x, fwd_y, fwd_z),
            (up_x, up_y, up_z),
            -target_yaw * reaction_gain,
        );
        let (_, _, _, _, _, _, next_right_x, next_right_y, next_right_z) =
            heading_basis(next_heading.0, next_heading.1, next_heading.2);
        next_heading = rotate_vector_around_axis(
            next_heading,
            (next_right_x, next_right_y, next_right_z),
            target_pitch * reaction_gain,
        );

        let (hx, hy, hz) = normalize_or_default(
            next_heading.0,
            next_heading.1,
            if self.z_mode_enabled {
                next_heading.2
            } else {
                0.0
            },
            1.0,
            0.0,
            0.0,
        );
        (hx, hy, hz, candidates_visited)
    }

    fn compute_flock2_lite_heading(
        &self,
        i: usize,
        dt: f32,
        centroid_x: f32,
        centroid_y: f32,
        centroid_z: f32,
    ) -> (f32, f32, f32, usize) {
        let wrap_x = !self.bounce_x;
        let wrap_y = !self.bounce_y;
        let wrap_z = !self.bounce_z;
        let px = self.pos_x[i];
        let py = self.pos_y[i];
        let pz = self.pos_z[i];
        let (fwd_x, fwd_y, fwd_z) = normalize_or_default(
            self.heading_x[i],
            self.heading_y[i],
            if self.z_mode_enabled {
                self.heading_z[i]
            } else {
                0.0
            },
            1.0,
            0.0,
            0.0,
        );
        let fov_cos = self.flock2_config.fov_cos();
        let radius_sq = self.flock2_config.neighbor_radius * self.flock2_config.neighbor_radius;
        let neighbor_cap = self.flock2_config.topological_neighbors.min(16);

        let mut sep_x = 0.0;
        let mut sep_y = 0.0;
        let mut sep_z = 0.0;
        let mut align_x = 0.0;
        let mut align_y = 0.0;
        let mut align_z = 0.0;
        let mut coh_x = 0.0;
        let mut coh_y = 0.0;
        let mut coh_z = 0.0;
        let mut visible_count = 0usize;
        let mut visited_count = 0usize;

        self.neighbor_grid.for_each_neighbor_with_wrap(
            i,
            self.flock2_config.neighbor_radius,
            wrap_x,
            wrap_y,
            |j| {
                if visited_count >= neighbor_cap {
                    return false;
                }
                let dx = axis_delta(self.pos_x[j] - px, wrap_x);
                let dy = axis_delta(self.pos_y[j] - py, wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
                let dist_sq = math::distance_sq_3d(dx, dy, dz);
                if dist_sq <= EPSILON || dist_sq > radius_sq {
                    return true;
                }

                let inv_dist = 1.0 / dist_sq.sqrt();
                let dir_x = dx * inv_dist;
                let dir_y = dy * inv_dist;
                let dir_z = if self.z_mode_enabled {
                    dz * inv_dist
                } else {
                    0.0
                };
                let forward_dot = dot3(fwd_x, fwd_y, fwd_z, dir_x, dir_y, dir_z);
                if forward_dot < fov_cos {
                    return true;
                }

                visited_count += 1;
                visible_count += 1;

                let inv_dsq = 1.0 / dist_sq.max(1.0e-4);
                sep_x -= dir_x * inv_dsq;
                sep_y -= dir_y * inv_dsq;
                sep_z -= dir_z * inv_dsq;

                let (avx, avy, avz) = normalize_or_default(
                    self.vel_x[j],
                    self.vel_y[j],
                    if self.z_mode_enabled {
                        self.vel_z[j]
                    } else {
                        0.0
                    },
                    0.0,
                    0.0,
                    0.0,
                );
                align_x += avx;
                align_y += avy;
                align_z += avz;
                coh_x += dir_x;
                coh_y += dir_y;
                coh_z += dir_z;
                true
            },
        );

        if visible_count > 0 {
            let inv_n = 1.0 / visible_count as f32;
            align_x *= inv_n;
            align_y *= inv_n;
            align_z *= inv_n;
            coh_x *= inv_n;
            coh_y *= inv_n;
            coh_z *= inv_n;
        }

        let mut target_x = sep_x * self.flock2_config.avoid_weight
            + align_x * self.flock2_config.align_weight
            + coh_x * self.flock2_config.cohesion_weight;
        let mut target_y = sep_y * self.flock2_config.avoid_weight
            + align_y * self.flock2_config.align_weight
            + coh_y * self.flock2_config.cohesion_weight;
        let mut target_z = sep_z * self.flock2_config.avoid_weight
            + align_z * self.flock2_config.align_weight
            + coh_z * self.flock2_config.cohesion_weight;

        if self.flock2_config.boundary_count > EPSILON
            && (visible_count as f32) < self.flock2_config.boundary_count
        {
            let boundary_ratio = ((self.flock2_config.boundary_count - visible_count as f32)
                / self.flock2_config.boundary_count)
                .clamp(0.0, 1.0);
            let to_center_x = axis_delta(centroid_x - px, wrap_x);
            let to_center_y = axis_delta(centroid_y - py, wrap_y);
            let to_center_z = if self.z_mode_enabled {
                axis_delta(centroid_z - pz, wrap_z)
            } else {
                0.0
            };
            let (bcx, bcy, bcz) =
                normalize_or_default(to_center_x, to_center_y, to_center_z, 0.0, 0.0, 0.0);
            target_x += bcx * self.flock2_config.boundary_weight * boundary_ratio;
            target_y += bcy * self.flock2_config.boundary_weight * boundary_ratio;
            target_z += bcz * self.flock2_config.boundary_weight * boundary_ratio;
        }

        let (target_x, target_y, target_z) = normalize_or_default(
            target_x,
            target_y,
            if self.z_mode_enabled { target_z } else { 0.0 },
            fwd_x,
            fwd_y,
            if self.z_mode_enabled { fwd_z } else { 0.0 },
        );
        let reaction_gain = (dt * 1_000.0 / self.flock2_config.reaction_time_ms).clamp(0.0, 1.0);
        let blend_x = fwd_x * (1.0 - reaction_gain) + target_x * reaction_gain;
        let blend_y = fwd_y * (1.0 - reaction_gain) + target_y * reaction_gain;
        let blend_z = if self.z_mode_enabled {
            fwd_z * (1.0 - reaction_gain) + target_z * reaction_gain
        } else {
            0.0
        };
        let (hx, hy, hz) = normalize_or_default(
            blend_x,
            blend_y,
            blend_z,
            fwd_x,
            fwd_y,
            if self.z_mode_enabled { fwd_z } else { 0.0 },
        );
        (hx, hy, hz, visited_count)
    }
}

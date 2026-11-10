use std::collections::HashMap;
use std::sync::Arc;

pub const DEFAULT_BUDGET: usize = 192 * 1024 * 1024;

struct Entry<T> {
    value: Arc<T>,
    bytes: usize,
    used: u64,
}

pub struct Store<T> {
    entries: HashMap<u32, Entry<T>>,
    next: u32,
    tick: u64,
    bytes: usize,
    budget: usize,
    evicted: u64,
    dropped: Vec<Arc<T>>,
}

impl<T> Default for Store<T> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            next: 1,
            tick: 0,
            bytes: 0,
            budget: DEFAULT_BUDGET,
            evicted: 0,
            dropped: Vec::new(),
        }
    }
}

impl<T> Store<T> {
    pub fn insert(&mut self, value: T, bytes: usize) -> u32 {
        let id = self.next;
        self.next = self.next.wrapping_add(1).max(1);
        self.tick += 1;
        self.entries.insert(
            id,
            Entry {
                value: Arc::new(value),
                bytes,
                used: self.tick,
            },
        );
        self.bytes += bytes;
        self.evict(id);
        id
    }

    pub fn get(&mut self, id: u32) -> Option<Arc<T>> {
        self.tick += 1;
        let tick = self.tick;
        self.entries.get_mut(&id).map(|entry| {
            entry.used = tick;
            entry.value.clone()
        })
    }

    pub fn contains(&self, id: u32) -> bool {
        self.entries.contains_key(&id)
    }

    pub fn remove(&mut self, id: u32) {
        if let Some(entry) = self.entries.remove(&id) {
            self.bytes -= entry.bytes;
            self.dropped.push(entry.value);
        }
    }

    pub fn set_budget(&mut self, budget: usize) {
        self.budget = budget;
        self.evict(0);
    }

    pub fn reevaluate(&mut self) {
        self.evict(0);
    }

    pub fn take_dropped(&mut self) -> Vec<Arc<T>> {
        std::mem::take(&mut self.dropped)
    }

    pub fn stats(&self) -> (usize, usize, usize, u64) {
        (self.entries.len(), self.bytes, self.budget, self.evicted)
    }

    fn evict(&mut self, keep: u32) {
        while self.bytes > self.budget {
            let victim = self
                .entries
                .iter()
                .filter(|(id, entry)| **id != keep && Arc::strong_count(&entry.value) == 1)
                .min_by_key(|(_, entry)| entry.used)
                .map(|(id, _)| *id);
            let Some(id) = victim else { return };
            self.remove(id);
            self.evicted += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_the_least_recently_used_tile_over_the_budget() {
        let mut store = Store::<u8>::default();
        store.set_budget(300);
        let a = store.insert(1, 100);
        let b = store.insert(2, 100);
        let c = store.insert(3, 100);
        store.get(a);
        let d = store.insert(4, 100);
        assert!(store.contains(a) && store.contains(c) && store.contains(d));
        assert!(!store.contains(b));
        assert_eq!(store.stats(), (3, 300, 300, 1));
    }

    #[test]
    fn keeps_tiles_that_are_on_screen() {
        let mut store = Store::<u8>::default();
        store.set_budget(200);
        let a = store.insert(1, 100);
        let shown = store.get(a);
        let b = store.insert(2, 100);
        let c = store.insert(3, 100);
        assert!(store.contains(a));
        assert!(!store.contains(b));
        assert!(store.contains(c));
        drop(shown);
    }

    #[test]
    fn released_tiles_are_handed_back_for_texture_cleanup() {
        let mut store = Store::<u8>::default();
        let a = store.insert(1, 10);
        store.remove(a);
        assert_eq!(store.take_dropped().len(), 1);
        assert_eq!(store.stats().1, 0);
    }
}

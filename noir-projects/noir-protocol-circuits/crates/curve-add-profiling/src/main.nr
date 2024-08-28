use dep::types::point::Point;

global Ga1 = Point { x: 0x30426e64aee30e998c13c8ceecda3a77807dbead52bc2f3bf0eae851b4b710c1, y: 0x113156a068f603023240c96b4da5474667db3b8711c521c748212a15bc034ea6, is_infinite: false };
global Ga2 = Point { x: 0x2825c79cc6a5cbbeef7d6a8f1b6a12b312aa338440aefeb4396148c89147c049, y: 0x129bfd1da54b7062d6b544e7e36b90736350f6fba01228c41c72099509f5701e, is_infinite: false };

fn main() -> pub Field {
    let mut p1 = Ga1;
    for _ in 0..1000 {
        p1 = p1 + Ga2;
    }
    p1.x
}

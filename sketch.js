function setup() {
    createCanvas(windowWidth, windowHeight);
    background(220);
}

function draw() {
    // Example: draw a circle that follows the mouse
    fill(random(255), random(255), random(255), 100);
    noStroke();
    circle(mouseX, mouseY, 50);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

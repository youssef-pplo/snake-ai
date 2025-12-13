# Snake AI Ultimate

A browser-based Snake game with neural network AI training capabilities. Train a neural network to play Snake or test your own skills!

## Features

- 🐍 **Classic Snake Gameplay** - Play the classic game yourself
- 🤖 **AI Training Mode** - Watch a neural network learn to play
- 🎨 **Beautiful Graphics** - High-quality graphics with grid effects and glow
- ⚡ **Performance Mode** - Low graphics mode for better battery/performance
- 📊 **Real-time Training Dashboard** - Monitor AI training progress
- 🎯 **Customizable AI** - Adjust population size and mutation rate
- 📱 **Mobile Support** - Touch controls for mobile devices

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Node.js (optional, for local development server)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/youssef-pplo/snake-ai.git
cd snake-ai
```

2. Install dependencies (optional):
```bash
npm install
```

3. Run the development server:
```bash
npm start
```

Or simply open `index.html` in your browser.

## Usage

### Playing the Game

1. Click **"Play Game"** to play manually
2. Use **Arrow Keys**, **Touch Controls**, or **Mobile D-Pad** to control the snake
3. Eat the red food to grow and increase your score!
4. Avoid hitting walls or your own tail

### Training the AI

1. Click **"Train AI"** to start AI training mode
2. Watch as the neural network learns through generations
3. Adjust training speed with the slider
4. Configure AI settings (population, mutation rate) via the "AI Config" button
5. Drag the dashboard to move it around

### Settings

- **Graphics Quality**: Switch between High (fancy effects) and Low (better performance)
- **AI Configuration**: Customize population size and mutation rate

## Technical Details

### Neural Network Architecture

- **Input Nodes**: 6 (blocked directions + food direction)
- **Hidden Nodes**: 12
- **Output Nodes**: 4 (Up, Down, Left, Right)

### AI Training

The AI uses a genetic algorithm:
- **Population**: Configurable (default: 200)
- **Mutation Rate**: Configurable (default: 0.05)
- **Elitism**: Top 4 performers survive to next generation
- **Fitness**: Based on score squared plus lifetime

## File Structure

```
snake-ai/
├── index.html      # Main HTML file
├── styles.css      # All CSS styles
├── script.js       # Game logic and AI
├── package.json    # Project configuration
├── .gitignore      # Git ignore rules
└── README.md       # This file
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Tips

- Use **Low Graphics** mode on mobile devices or older hardware
- Reduce **Population Size** if experiencing lag during AI training
- Lower **Training Speed** for smoother animation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for learning or personal projects.

## Credits

Created by [youssef pplo](https://pplo.dev)

## Acknowledgments

- Inspired by the classic Snake game
- Neural network implementation based on genetic algorithms
- Built with vanilla JavaScript (no frameworks required)


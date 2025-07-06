import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import {
  Container,
  Typography,
  Select,
  MenuItem,
  Button,
  LinearProgress,
  Box,
  Card,
  CardContent,
  Grid
} from '@mui/material';

ChartJS.register(ArcElement, Tooltip, Legend); // register chart components

function App() {
  const [drives, setDrives] = useState([]);                                                         // list of drives
  const [selectedDrive, setSelectedDrive] = useState('');                                           // currently selected drive
  const [data, setData] = useState({ labels: [], datasets: [{ data: [], backgroundColor: [] }] });  // chart data
  const [loading, setLoading] = useState(false);                                                    // loading state
  const [progress, setProgress] = useState(0);                                                      // folder count progress
  const eventSourceRef = useRef(null);                                                              // used to stream data from backend

  // fetch available drives on mount
  useEffect(() => {
    fetch('http://localhost:3001/drives')
      .then(res => res.json())
      .then(drives => {
        setDrives(drives);
        if (drives.length > 0) setSelectedDrive(drives[0]); // auto-select first drive
      });
  }, []);

  // scan drive and stream folder sizes
  const scanWithProgress = useCallback((drive) => {
    // generate random RGB color
    const getRandomColor = () => {
      const r = Math.floor(Math.random() * 200);
      const g = Math.floor(Math.random() * 200);
      const b = Math.floor(Math.random() * 200);
      return `rgb(${r},${g},${b})`;
    };

    // close previous stream if open
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // reset state
    setLoading(true);
    setProgress(0);
    setData({ labels: [], datasets: [{ data: [], backgroundColor: [] }] });

    // open SSE connection to backend
    const source = new EventSource(`http://localhost:3001/scan-stream?path=${encodeURIComponent(drive)}&depth=1`);
    eventSourceRef.current = source;

    // initialize arrays for chart data
    const labels = [];
    const sizes = [];
    const colors = [];

    // handle incoming folder data
    source.onmessage = (event) => {
      const { name, size } = JSON.parse(event.data);
      labels.push(name);
      sizes.push(size);
      colors.push(getRandomColor());

      setProgress(prev => prev + 1); // update folder count
      setData({
        labels: [...labels],
        datasets: [{ data: [...sizes], backgroundColor: [...colors] }]
      });
    };

    // handle scan completion
    source.addEventListener('done', () => {
      setLoading(false);
      source.close();
      eventSourceRef.current = null;
    });

    // handle errors
    source.onerror = () => {
      alert('Error during scan.');
      setLoading(false);
      source.close();
      eventSourceRef.current = null;
    };
  }, []);

  return (
    <Container
      maxWidth="md"
      sx={{
        mt: 6,
        mb: 6,
        p: 4,
        borderRadius: 4,
        background: 'linear-gradient(135deg, #fdfbfb, #ebedee)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* header */}
      <Box sx={{ textAlign: 'center'}}>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 750,
          }}
        >
          Disk Space Visualizer
        </Typography>

        <Typography variant="subtitle1" color="text.secondary">
          Scan your drives and visualize directory sizes in real time
        </Typography>
      </Box>

      {/* drive selector + scan button */}
      <Grid container spacing={2} alignItems="center" sx={{ mb: 4 }}>
        <Grid item xs={12} sm={8}>
          <Select
            value={selectedDrive}
            onChange={(e) => setSelectedDrive(e.target.value)}
            disabled={loading}
            fullWidth
            variant="outlined"
            sx={{
              borderRadius: 2,
              backgroundColor: '#fff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
            }}
          >
            {drives.map((drive) => (
              <MenuItem key={drive} value={drive}>
                {drive}
              </MenuItem>
            ))}
          </Select>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Button
            variant="contained"
            onClick={() => scanWithProgress(selectedDrive)}
            disabled={loading}
            fullWidth
            size="large"
            sx={{
              backgroundColor: '#1976d2', // solid blue
              color: '#fff',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 4,
              py: 1.5,
              '&:hover': {
                backgroundColor: '#1565c0', // darker blue on hover
              },
              '&:disabled': {
                backgroundColor: '#90caf9', // lighter blue when disabled
                color: '#fff',
              },
            }}
          >
            {loading ? 'Scanning...' : 'Scan'}
          </Button>
        </Grid>
      </Grid>

      {/* progress bar */}
      {loading && (
        <Box sx={{ mb: 4 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(to right, #43cea2, #185a9d)',
              },
            }}
          />
          <Typography
            variant="body2"
            sx={{ mt: 1, textAlign: 'center', color: '#555' }}
          >
            Scanning... {progress} folders
          </Typography>
        </Box>
      )}

      {/* pie chart */}
      {data.labels.length > 0 && (
        <Card
          elevation={6}
        >
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {selectedDrive} Drive
            </Typography>
            <Pie data={data} />
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default App;
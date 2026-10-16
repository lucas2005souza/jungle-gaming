npm run test:perf                         # both measurements (about 6 minutes plus the build)
npm run test:perf -- --grep "3 min"       # only the 3-minute session
npm run test:perf -- --grep "5 game"      # only the memory cycles
npm run test:perf:report                  # HTML report of the last run
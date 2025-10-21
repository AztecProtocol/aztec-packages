#include <array>
#include <iostream>
#include <memory>
#include <string>
#include <sys/wait.h>
#include <unistd.h>

class Process {
  private:
    pid_t pid;
    int stdin_fd = 0;
    int stdout_fd = 0;

  public:
    Process(const std::string& command);
    ~Process();
    Process(const Process&) = delete;
    Process& operator=(const Process&) = delete;
    Process(Process&&) = default;
    Process& operator=(Process&&) = default;

    /// Ends line with a newline character, sends to the process.
    void write_line(const std::string& line) const;

    /// Reads a line from the process.
    std::string read_line() const;
};
